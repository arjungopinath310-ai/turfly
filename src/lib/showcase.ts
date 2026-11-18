import type { BookingSource, BookingStatus, PitchConfig, Turf, User } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "./db";
import { isExclusionViolation } from "./errors";
import { listGame } from "./games";
import { getSettings, turfPolicy } from "./settings";
import { addDays, istToUtc, todayIst } from "./time";

/**
 * The sales specimen ("Turfly Showcase Arena (Sample)"): a fully set-up turf with realistic activity, so a demo
 * always shows a busy dashboard, live slots and open games.
 * - scripts/seed-showcase.ts rebuilds it from scratch (two months of history up to today).
 * - topUpShowcase() keeps it current without deleting anything: days that have no sample activity yet (new days
 *   ahead, or a gap after the PC was off) get bookings, and there are always a few open games to join.
 *   The cron loop calls it while DEMO_MODE is on.
 * Only the sample turf and the reserved sample players (+91 90000001xx) are touched.
 */

export const SHOWCASE_SLUG = "turfly-showcase-arena";
export const SHOWCASE_OWNER_PHONE = "+919000000001";
export const DAYS_BACK = 60;
export const DAYS_AHEAD = 10;
export const PLAYERS = ["Rahul K", "Ashiq P", "Nihal M", "Fahad T", "Shamil V", "Sanju R", "Adil K", "Jishnu P", "Afsal N", "Vishnu S"];
export const samplePlayerPhone = (i: number) => `+9190000001${String(i + 1).padStart(2, "0")}`;
const POSITIONS = ["Goalkeeper", "Defender", "Midfielder", "Forward", "Any"];
const TEAMS = ["Manjeri Strikers", "FC Kacherippadi", "Payyanad Boys", "Sunday Legends", "Office XI", "Night Owls FC", null, null, null];
const WALKINS = ["Shafeeq", "Arun & friends", "College team", "Muneer", "Jabir", "Sreejith", "Office group", "Riyas"];
const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Deterministic randomness, so the same day always gets the same shape of activity. */
export function makeRand(seed: number) {
  let s = seed | 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
  return { rand, pick };
}
const daySeed = (day: string) => Number(day.replace(/-/g, "")) ^ 0x5eed;
const bookingCode = () => "TF-" + Array.from(randomBytes(6), (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");

type Cfg = PitchConfig & {
  units: { unitId: string }[];
  pricingRules: { startMinute: number; endMinute: number; pricePerHour: number; weekdays: number[]; priority: number }[];
};

export interface ShowcaseCtx {
  turf: Turf;
  owner: User;
  players: User[];
  configs: Cfg[];
  unitIds: string[];
  advance: number;
  policy: object;
}

export interface DayResult {
  created: number;
  reviews: { bookingId: string; userId: string; at: Date }[];
}

/** Same idea as the engine's pricing: the highest-priority rule covering each hour, else the base price. */
function priceFor(cfg: Cfg, weekday: number, startMinute: number, minutes: number) {
  let total = 0;
  for (let m = startMinute; m < startMinute + minutes; m += 60) {
    const mm = m % 1440;
    const rule = cfg.pricingRules
      .filter((r) => (!r.weekdays.length || r.weekdays.includes(weekday)) && mm >= r.startMinute && mm < r.endMinute)
      .sort((a, b) => b.priority - a.priority)[0];
    total += rule?.pricePerHour ?? cfg.basePricePerHour;
  }
  return total;
}

/** Loads the sample turf and its sample players (or null when the showcase hasn't been created). */
export async function loadShowcase(): Promise<ShowcaseCtx | null> {
  const turf = await prisma.turf.findUnique({ where: { slug: SHOWCASE_SLUG } });
  if (!turf || !turf.isDemo || !turf.ownerId) return null;
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: turf.ownerId } });
  const players = await ensureSamplePlayers();
  const configs = (await prisma.pitchConfig.findMany({ where: { turfId: turf.id, isActive: true }, include: { units: true, pricingRules: true }, orderBy: { sortOrder: "asc" } })) as Cfg[];
  const units = await prisma.resourceUnit.findMany({ where: { turfId: turf.id, isVirtual: false }, select: { id: true } });
  const settings = await getSettings();
  return { turf, owner, players, configs, unitIds: units.map((u) => u.id), advance: settings.advanceAmountPaise, policy: turfPolicy({ cancellationPolicy: null }, settings) as object };
}

export async function ensureSamplePlayers() {
  const players: User[] = [];
  for (const [i, name] of PLAYERS.entries()) {
    const phone = samplePlayerPhone(i);
    players.push(
      await prisma.user.upsert({
        where: { phone },
        update: {},
        create: { phone, name, preferredPosition: POSITIONS[i % POSITIONS.length], referralCode: randomBytes(9).toString("base64url").slice(0, 6) },
      }),
    );
  }
  return players;
}

/**
 * One day of bookings, busiest in the evenings and weekends. Slots already taken (by real bookings, holds or blocks)
 * are left alone, and the database's no-overlap rule is the final check. Times before `notBefore` are skipped.
 */
export async function generateShowcaseDay(c: ShowcaseCtx, day: string, opts: { notBefore?: Date; growth?: number } = {}): Promise<DayResult> {
  const { rand, pick } = makeRand(daySeed(day));
  const now = new Date();
  const weekday = new Date(day + "T00:00:00Z").getUTCDay();
  const weekend = weekday === 0 || weekday === 6 || weekday === 5;
  const growth = opts.growth ?? 1;
  const [fullCfg, ...halves] = [...c.configs].sort((a, b) => b.playersPerSide - a.playersPerSide);
  const busy = new Map<string, Set<number>>(c.unitIds.map((id) => [id, new Set<number>()]));
  // Hours already taken on this day
  const dayStart = istToUtc(day, 0);
  const taken = await prisma.occupancy.findMany({ where: { unitId: { in: c.unitIds }, released: false, startAt: { lt: istToUtc(day, 25 * 60) }, endAt: { gt: dayStart } } });
  for (const o of taken)
    for (let h = 0; h < 25; h++) {
      const hs = istToUtc(day, h * 60);
      if (hs < o.endAt && new Date(hs.getTime() + 3_600_000) > o.startAt) busy.get(o.unitId)?.add(h);
    }
  const free = (cfg: Cfg, h: number, len: number) =>
    cfg.units.every((u) => Array.from({ length: len }, (_, k) => h + k).every((x) => x < 25 && !busy.get(u.unitId)?.has(x)));
  const take = (cfg: Cfg, h: number, len: number) => cfg.units.forEach((u) => Array.from({ length: len }, (_, k) => busy.get(u.unitId)?.add(h + k)));

  const out: DayResult = { created: 0, reviews: [] };
  for (let h = 6; h <= 24; h++) {
    const p = (h < 9 ? 0.35 : h < 16 ? 0.08 : h < 18 ? 0.3 : h < 23 ? (weekend ? 0.92 : 0.75) : 0.4) * growth;
    for (const attempt of [0, 1]) {
      if (rand() > (attempt === 0 ? p : p * 0.6)) continue;
      const cfg = attempt === 0 ? (rand() < 0.55 || !halves.length ? fullCfg : pick(halves)) : halves.length ? pick(halves) : fullCfg;
      const len = h >= 18 && h <= 22 && rand() < 0.22 ? 2 : 1;
      const startAt = istToUtc(day, h * 60);
      if (opts.notBefore && startAt < opts.notBefore) continue;
      if (!free(cfg, h, len)) continue;
      take(cfg, h, len);

      const endAt = istToUtc(day, (h + len) * 60);
      const minutes = len * 60;
      const totalPrice = priceFor(cfg, weekday, h * 60, minutes);
      const r = rand();
      const source: BookingSource = r < 0.62 ? "ONLINE" : r < 0.82 ? "PHONE" : "WALK_IN";
      const past = endAt <= now;
      const s = rand();
      const status: BookingStatus = s < 0.05 ? "CANCELLED" : past ? (s < 0.07 ? "NO_SHOW" : "COMPLETED") : "CONFIRMED";
      const leadMs = source === "WALK_IN" ? 10 * 60_000 : source === "PHONE" ? (2 + rand() * 60) * 3_600_000 : (4 + rand() * 140) * 3_600_000;
      const createdAt = new Date(Math.min(startAt.getTime() - leadMs, now.getTime() - (1 + rand() * 90) * 60_000));
      const online = source === "ONLINE";
      const player = online ? pick(c.players) : null;
      const team = online ? pick(TEAMS) : rand() < 0.3 ? pick(TEAMS) : null;
      const collected = status === "COMPLETED" && !(past && endAt.getTime() > now.getTime() - 3 * 86_400_000 && rand() < 0.35);
      const method = pick(["upi", "upi", "upi", "card", "wallet"]);
      const reason = pick(["Team couldn't make it", "Rain", "Rescheduled to another day"]);
      const walkIn = pick(WALKINS);
      const note = source === "PHONE" && rand() < 0.2 ? "Called the turf" : null;
      const review = status === "COMPLETED" && online && rand() < 0.45;
      const reviewAt = new Date(endAt.getTime() + (2 + rand() * 20) * 3_600_000);
      const cancelledAt = status === "CANCELLED" ? new Date(Math.min(startAt.getTime() - 30 * 3_600_000 * rand(), now.getTime())) : null;

      try {
        const id = await prisma.$transaction(async (tx) => {
          const b = await tx.booking.create({
            data: {
              code: bookingCode(),
              turfId: c.turf.id,
              configId: cfg.id,
              userId: player?.id ?? null,
              source,
              status,
              startAt,
              endAt,
              durationMinutes: minutes,
              totalPrice,
              advanceAmount: online ? c.advance : 0,
              platformFee: 0,
              onlineAmount: online ? c.advance : 0,
              balanceDue: online ? totalPrice - c.advance : totalPrice,
              balanceCollectedAt: collected ? new Date(endAt.getTime() - 15 * 60_000) : null,
              balanceCollectedBy: collected ? c.owner.id : null,
              policySnapshot: c.policy,
              confirmedAt: new Date(createdAt.getTime() + 60_000),
              cancelledAt,
              cancelledBy: status === "CANCELLED" ? (online ? player!.id : c.owner.id) : null,
              cancelReason: status === "CANCELLED" ? reason : null,
              teamName: team,
              customerName: online ? null : walkIn,
              notes: note,
              createdAt,
            },
          });
          if (status !== "CANCELLED") await tx.occupancy.createMany({ data: cfg.units.map((u) => ({ unitId: u.unitId, bookingId: b.id, startAt, endAt, createdAt })) });
          if (online) {
            const pay = await tx.payment.create({
              data: {
                bookingId: b.id,
                userId: player!.id,
                provider: "mock",
                providerOrderId: `sample_order_${b.code}`,
                providerPaymentId: `sample_pay_${b.code}`,
                amount: c.advance,
                status: status === "CANCELLED" ? "REFUNDED" : "CAPTURED",
                method,
                capturedAt: new Date(createdAt.getTime() + 45_000),
                refundedAmount: status === "CANCELLED" ? c.advance : 0,
                createdAt,
              },
            });
            await tx.ledgerEntry.create({ data: { turfId: c.turf.id, bookingId: b.id, paymentId: pay.id, type: "ADVANCE_COLLECTED", amount: c.advance, note: "Online advance collected by platform", createdAt: new Date(createdAt.getTime() + 60_000) } });
            if (status === "CANCELLED") {
              const why = "Cancelled 24 h or more before the match: full refund";
              await tx.refund.create({ data: { paymentId: pay.id, amount: c.advance, status: "PROCESSED", providerRefundId: `sample_rfnd_${b.code}`, reason: why, createdAt: cancelledAt! } });
              await tx.ledgerEntry.create({ data: { turfId: c.turf.id, bookingId: b.id, paymentId: pay.id, type: "REFUND", amount: -c.advance, note: why, createdAt: cancelledAt! } });
            }
          }
          return b.id;
        });
        out.created++;
        if (review && player) out.reviews.push({ bookingId: id, userId: player.id, at: reviewAt });
      } catch (e) {
        if (!isExclusionViolation(e)) throw e; // someone took the slot meanwhile: skip it
      }
    }
  }
  return out;
}

const REVIEWS = [
  "Excellent turf, lights are very bright at night.",
  "Clean washrooms and easy parking. Booking took a minute.",
  "Good grass, no bald patches. Will book again.",
  "Staff were helpful, started on time.",
  "Great for 5s, we split the pitch with another team.",
  "Bit crowded at peak time but the pitch is top class.",
  "Loved the reminders on WhatsApp. Smooth experience.",
  null,
  null,
];

/** Verified reviews for sample bookings that were played, then the turf's rating. */
export async function addShowcaseReviews(c: ShowcaseCtx, queue: DayResult["reviews"]) {
  const now = new Date();
  let added = 0;
  for (const r of queue) {
    if (r.at > now) continue;
    const { rand, pick } = makeRand(r.at.getTime() % 2147483647);
    const overall = rand() < 0.68 ? 5 : rand() < 0.85 ? 4 : 3;
    const near = (v: number) => Math.max(3, Math.min(5, v + (rand() < 0.2 ? -1 : 0)));
    await prisma.review.create({
      data: { bookingId: r.bookingId, turfId: c.turf.id, userId: r.userId, overall, turfQuality: near(overall), cleanliness: near(overall), lighting: near(5), parking: near(overall), comment: pick(REVIEWS), createdAt: r.at },
    });
    added++;
  }
  const agg = await prisma.review.aggregate({ where: { turfId: c.turf.id }, _avg: { overall: true }, _count: true });
  await prisma.turf.update({ where: { id: c.turf.id }, data: { ratingAvg: agg._avg.overall ?? 0, ratingCount: agg._count } });
  return added;
}

const GAME_NOTES = [
  "Two of our regulars dropped out. Friendly game, all levels welcome.",
  "Need a goalkeeper! Rest of the team is ready.",
  "Office team, short by a few. Casual game after work.",
  "Sunday group, we play every week. Join us.",
  "Competitive 7s. Bring studs and water.",
  null,
];
const ASKS = ["Hi, can I join? I usually play midfield.", "Count me in! I can play in goal.", "Can I bring a friend? We both play defence.", "Is there space for one more? I play forward."];
const REPLIES = ["Sure, see you there! Come 10 minutes early.", "Welcome! We split the turf fee at the ground.", "Great, you're in."];

/**
 * Keeps a few open games on the sample turf in the coming week: sample players' upcoming evening bookings are
 * listed as short of players, some with a player already accepted and another asking to join, with their chat.
 */
export async function ensureShowcaseGames(c: ShowcaseCtx, target = 4) {
  const now = new Date();
  const soon = new Date(now.getTime() + 3 * 3_600_000);
  const active = await prisma.playerPost.findMany({
    where: { turfId: c.turf.id, status: "OPEN", startAt: { gt: soon }, booking: { status: "CONFIRMED" } },
    include: { _count: { select: { requests: { where: { status: "ACCEPTED" } } } } },
  });
  let have = active.filter((p) => p.playersNeeded > p._count.requests).length;
  if (have >= target) return 0;
  const playerIds = c.players.map((p) => p.id);
  const candidates = await prisma.booking.findMany({
    where: {
      turfId: c.turf.id,
      status: "CONFIRMED",
      source: "ONLINE",
      userId: { in: playerIds },
      startAt: { gt: soon, lt: new Date(now.getTime() + 7 * 86_400_000) },
      posts: { none: {} },
    },
    include: { turf: true, config: true },
    orderBy: { startAt: "asc" },
  });
  // Evenings first, one per day, so the list looks like a real week
  const evening = (d: Date) => {
    const h = (d.getUTCHours() + 5 + Math.floor((d.getUTCMinutes() + 30) / 60)) % 24;
    return h >= 17 && h <= 22;
  };
  const days = new Set(active.map((p) => todayIst(p.startAt)));
  const ordered = [...candidates.filter((b) => evening(b.startAt)), ...candidates.filter((b) => !evening(b.startAt))];
  let created = 0;
  for (const b of ordered) {
    if (have >= target) break;
    const day = todayIst(b.startAt);
    if (days.has(day) && ordered.length - created > target) continue;
    days.add(day);
    const { rand, pick } = makeRand(b.startAt.getTime() % 2147483647);
    const pps = b.config.playersPerSide;
    const needed = pps >= 7 ? pick([2, 3, 4]) : pick([1, 2, 3]);
    const post = await listGame(prisma, b, { playersNeeded: needed, note: pick(GAME_NOTES), skillLevel: pick(["Casual", "Intermediate", null, "Competitive"]) }, "OPEN");
    await prisma.playerPost.update({ where: { id: post.id }, data: { createdAt: new Date(Math.max(b.createdAt.getTime(), now.getTime() - (2 + rand() * 30) * 3_600_000)) } });
    const others = c.players.filter((p) => p.id !== b.userId);
    const askers = [pick(others), pick(others)].filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i);
    for (const [i, u] of askers.entries()) {
      const accept = i === 0 && needed >= 2;
      if (i === 1 && rand() < 0.4) continue;
      const askedAt = new Date(now.getTime() - (15 + rand() * 150) * 60_000); // within the last few hours
      const req = await prisma.playerPostRequest.create({
        data: { postId: post.id, userId: u.id, message: pick(ASKS), status: accept ? "ACCEPTED" : "PENDING", createdAt: askedAt, lastMessageAt: askedAt },
      });
      await prisma.playerPostMessage.create({ data: { requestId: req.id, senderId: u.id, body: req.message!, createdAt: askedAt } });
      if (accept) {
        const replyAt = new Date(askedAt.getTime() + (3 + rand() * 40) * 60_000);
        await prisma.playerPostMessage.create({ data: { requestId: req.id, senderId: b.userId!, body: pick(REPLIES), createdAt: replyAt } });
        await prisma.playerPostRequest.update({ where: { id: req.id }, data: { lastMessageAt: replyAt } });
        await prisma.matchPlayer.create({ data: { bookingId: b.id, userId: u.id, name: u.name ?? "Player", status: "CONFIRMED" } });
      }
    }
    created++;
    have++;
  }
  return created;
}

const CHATS: { from: number; lines: [who: "p" | "o", text: string, minsAgo: number][] }[] = [
  { from: 3, lines: [["p", "Hi, is the full pitch free this Sunday 7 AM? We are 14 players.", 190], ["o", "Yes, 7 AM is free. Early-bird price ₹1,200. You can book it in the app.", 172], ["p", "Booked, thanks!", 160]] },
  { from: 6, lines: [["p", "Do you have bibs and balls at the turf?", 75], ["o", "Yes, bibs and 3 match balls are free with every booking.", 60]] },
  { from: 8, lines: [["p", "Can we pay the balance by UPI at the ground?", 18], ["p", "Also, is there parking for 6 bikes?", 16]] },
];

/** A few sample player questions in the owner's inbox (once; chats started by real people don't count). */
export async function ensureShowcaseChats(c: ShowcaseCtx) {
  if (await prisma.conversation.count({ where: { turfId: c.turf.id, playerId: { in: c.players.map((p) => p.id) } } })) return 0;
  const now = Date.now();
  for (const chat of CHATS) {
    const player = c.players[chat.from];
    const at = (m: number) => new Date(now - m * 60_000);
    const last = chat.lines[chat.lines.length - 1];
    const lastAt = at(last[2]);
    // The last chat is unread by the owner, so the inbox shows a new message
    const ownerRead = last[0] === "p" && chat === CHATS[CHATS.length - 1] ? at(chat.lines[0][2] + 1) : lastAt;
    await prisma.conversation.create({
      data: {
        turfId: c.turf.id,
        playerId: player.id,
        lastMessageAt: lastAt,
        lastMessageText: last[1].slice(0, 140),
        lastSenderId: last[0] === "p" ? player.id : c.owner.id,
        playerLastReadAt: lastAt,
        ownerLastReadAt: ownerRead,
        createdAt: at(chat.lines[0][2]),
        messages: { create: chat.lines.map(([who, body, m]) => ({ senderId: who === "p" ? player.id : c.owner.id, body, createdAt: at(m) })) },
      },
    });
  }
  return CHATS.length;
}

/**
 * Keeps the sample turf current without deleting anything: fills days with no sample activity (from the last
 * sample day up to DAYS_AHEAD ahead), then makes sure there are open games to join. Cheap when nothing is due.
 */
export async function topUpShowcase() {
  const c = await loadShowcase();
  if (!c) return { skipped: "no sample turf" };
  const today = todayIst();
  const now = new Date();
  const sampleUsers = c.players.map((p) => p.id);
  // Sample players' bookings mark how far the sample activity reaches (bookings made during a demo don't count)
  const sampleWhere = { turfId: c.turf.id, userId: { in: sampleUsers } };
  const last = await prisma.booking.findFirst({ where: sampleWhere, orderBy: { startAt: "desc" }, select: { startAt: true } });
  const first = last ? addDays(todayIst(last.startAt), 1) : today;
  const from = first < addDays(today, -DAYS_BACK) ? addDays(today, -DAYS_BACK) : first;
  const until = addDays(today, DAYS_AHEAD);
  let days = 0;
  let created = 0;
  const reviews: DayResult["reviews"] = [];
  for (let d = from; d <= until; d = addDays(d, 1)) {
    const r = await generateShowcaseDay(c, d, { notBefore: d === today ? new Date(now.getTime() + 60 * 60_000) : undefined });
    created += r.created;
    reviews.push(...r.reviews);
    days++;
  }
  const reviewed = reviews.length ? await addShowcaseReviews(c, reviews) : 0;
  const games = await ensureShowcaseGames(c);
  const chats = await ensureShowcaseChats(c);
  if (created || games) await prisma.turf.update({ where: { id: c.turf.id }, data: { availabilityUpdatedAt: now } });
  return { days, bookings: created, reviews: reviewed, games, chats };
}
