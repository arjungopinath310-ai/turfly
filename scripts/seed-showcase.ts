/**
 * Sales specimen: one fully set-up turf with two months of realistic activity, to show prospective turf owners
 * what Turfly looks like when a turf runs on it (dashboard, calendar, bookings, analytics, reviews, live slots).
 *
 *   npx tsx scripts/seed-showcase.ts --dry-run   (prints what it would create)
 *   npx tsx scripts/seed-showcase.ts             (writes to DATABASE_URL; take a backup first)
 *
 * It is clearly labelled: isDemo = true ("Demo listing" badge), "(Sample)" in the name, sample address and description.
 * Owner login: the demo owner +91 9000000001 (sign in with the demo code while DEMO_OTP is on).
 * Safe to run again: it deletes only this turf (slug turfly-showcase-arena) and everything attached to it, then
 * rebuilds it, so the history always ends "today". Real turfs and real users are never touched; the sample
 * players use the reserved +91 90000001xx numbers.
 */
import { PrismaClient, type BookingSource, type BookingStatus, type PitchConfig } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { convertiblePitchLayout } from "../src/lib/engine/allocation";
import { addDays, istToUtc, todayIst } from "../src/lib/time";
import { getSettings, turfPolicy } from "../src/lib/settings";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const SLUG = "turfly-showcase-arena";
const DAYS_BACK = 60;
const DAYS_AHEAD = 10;

// Deterministic randomness, so every run produces the same shape of history.
let seed = 20261117;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const code = () => "TF-" + Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)]).join("");
const tok = () => randomBytes(12).toString("base64url");

const PLAYERS = ["Rahul K", "Ashiq P", "Nihal M", "Fahad T", "Shamil V", "Sanju R", "Adil K", "Jishnu P", "Afsal N", "Vishnu S"];
const TEAMS = ["Manjeri Strikers", "FC Kacherippadi", "Payyanad Boys", "Sunday Legends", "Office XI", "Night Owls FC", null, null, null];
const WALKINS = ["Shafeeq", "Arun & friends", "College team", "Muneer", "Jabir", "Sreejith", "Office group", "Riyas"];
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
const PHOTOS = ["1624880357913-a8539238245b", "1551958219-acbc608c6377", "1575361204480-aadea25e6e68", "1574629810360-7efbbe195018"].map(
  (id) => `https://images.unsplash.com/photo-${id}?w=1200&q=70`, // free to use (Unsplash licence)
);

type Cfg = PitchConfig & { units: { unitId: string }[]; pricingRules: { startMinute: number; endMinute: number; pricePerHour: number; weekdays: number[]; priority: number }[] };

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

async function removeExisting() {
  const t = await prisma.turf.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!t) return 0;
  const bookings = await prisma.booking.findMany({ where: { turfId: t.id }, select: { id: true, code: true } });
  const B = bookings.map((b) => b.id);
  const P = (await prisma.payment.findMany({ where: { bookingId: { in: B } }, select: { id: true } })).map((p) => p.id);
  await prisma.$transaction([
    prisma.refund.deleteMany({ where: { paymentId: { in: P } } }),
    prisma.ledgerEntry.deleteMany({ where: { turfId: t.id } }),
    prisma.payment.deleteMany({ where: { id: { in: P } } }),
    prisma.review.deleteMany({ where: { turfId: t.id } }),
    prisma.dispute.deleteMany({ where: { bookingId: { in: B } } }),
    prisma.playerPost.deleteMany({ where: { OR: [{ turfId: t.id }, { bookingId: { in: B } }] } }),
    prisma.conversation.deleteMany({ where: { turfId: t.id } }),
    prisma.notification.deleteMany({ where: { OR: [{ link: { contains: SLUG } }, ...bookings.map((b) => ({ link: { contains: b.id } }))] } }),
    prisma.booking.deleteMany({ where: { id: { in: B } } }),
    prisma.slotBlock.deleteMany({ where: { turfId: t.id } }),
    prisma.turfClaim.deleteMany({ where: { turfId: t.id } }),
    prisma.turf.delete({ where: { id: t.id } }),
  ]);
  return bookings.length;
}

async function main() {
  const manjeri = await prisma.city.findUniqueOrThrow({ where: { slug: "manjeri" } });
  const settings = await getSettings();
  const ADVANCE = settings.advanceAmountPaise; // the platform's online advance (₹49 by default)
  const policy = turfPolicy({ cancellationPolicy: null }, settings);

  const today = todayIst();
  const now = new Date();
  const days = Array.from({ length: DAYS_BACK + DAYS_AHEAD + 1 }, (_, i) => addDays(today, i - DAYS_BACK));
  const blockDay = addDays(today, 4); // planned maintenance 6-8 AM: no bookings are generated there
  if (dryRun) {
    console.log(`Dry run: would (re)create "${SLUG}" with ${days.length} days of activity (${days[0]} … ${days[days.length - 1]}), 10 sample players, reviews and a maintenance block.`);
    await prisma.$disconnect();
    return;
  }

  const removed = await removeExisting();
  if (removed) console.log(`Removed the previous sample turf and its ${removed} bookings.`);

  const owner = await prisma.user.upsert({
    where: { phone: "+919000000001" },
    update: { role: "OWNER", name: "Demo Owner" },
    create: { phone: "+919000000001", name: "Demo Owner", role: "OWNER", referralCode: tok().slice(0, 6) },
  });
  const players = [];
  for (const [i, name] of PLAYERS.entries()) {
    const phone = `+9190000001${String(i + 1).padStart(2, "0")}`;
    players.push(await prisma.user.upsert({ where: { phone }, update: { name }, create: { phone, name, referralCode: tok().slice(0, 6) } }));
  }

  // ── The turf, set up the way a model owner would ──
  const turf = await prisma.turf.create({
    data: {
      slug: SLUG,
      name: "Turfly Showcase Arena (Sample)",
      description:
        "Sample turf: this is what a fully set-up Turfly listing looks like. One 7-a-side pitch that splits into two 5-a-side pitches, live free slots, online booking with a ₹49 advance, peak and early-bird prices, floodlights till 1 AM and verified reviews. Not a real ground.",
      ownerId: owner.id,
      status: "APPROVED",
      availabilityMode: "LIVE",
      availabilityUpdatedAt: now,
      cityId: manjeri.id,
      addressLine: "Sample listing",
      locality: "Manjeri Town",
      pincode: "676121",
      lat: 11.12146,
      lng: 76.11868,
      phone: "+919000000001",
      whatsapp: "+919000000001",
      photos: PHOTOS,
      amenities: ["parking", "washroom", "changing_room", "drinking_water", "floodlights", "seating", "cafe", "first_aid", "shower", "bibs"],
      slotStepMinutes: 60,
      allowedDurations: [60, 120],
      minNoticeMinutes: 30,
      maxAdvanceDays: 30,
      isDemo: true,
      isFeatured: true,
      createdAt: istToUtc(addDays(today, -DAYS_BACK - 14), 600),
    },
  });
  await prisma.operatingHours.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ turfId: turf.id, weekday, openMinute: 360, closeMinute: 1500 })) });

  const l = convertiblePitchLayout({ halvesSimultaneous: true, allowCombined: true, fullPricePerHour: 150000, halfPricePerHour: 90000 });
  const unitIds: Record<string, string> = {};
  for (const [i, u] of l.units.entries()) unitIds[u.key] = (await prisma.resourceUnit.create({ data: { turfId: turf.id, name: u.name, isVirtual: Boolean(u.isVirtual), sortOrder: i } })).id;
  for (const [i, c] of l.configs.entries()) {
    const cfg = await prisma.pitchConfig.create({
      data: { turfId: turf.id, name: c.name, playersPerSide: c.playersPerSide, basePricePerHour: c.basePricePerHour, sortOrder: i, units: { create: c.unitKeys.map((k) => ({ unitId: unitIds[k] })) } },
    });
    const full = c.playersPerSide === 7;
    await prisma.pricingRule.createMany({
      data: [
        { configId: cfg.id, label: "Peak evening", weekdays: [], startMinute: 18 * 60, endMinute: 23 * 60, pricePerHour: full ? 180000 : 110000, priority: 2 },
        { configId: cfg.id, label: "Early bird", weekdays: [], startMinute: 6 * 60, endMinute: 9 * 60, pricePerHour: full ? 120000 : 70000, priority: 1 },
        { configId: cfg.id, label: "Weekend day", weekdays: [0, 6], startMinute: 9 * 60, endMinute: 18 * 60, pricePerHour: full ? 160000 : 100000, priority: 1 },
      ],
    });
  }
  const configs = (await prisma.pitchConfig.findMany({ where: { turfId: turf.id }, include: { units: true, pricingRules: true }, orderBy: { sortOrder: "asc" } })) as Cfg[];
  const [fullCfg, halfA, halfB] = configs;

  // ── Two months of bookings, busiest in the evenings and weekends, growing week by week ──
  const counts = { ONLINE: 0, PHONE: 0, WALK_IN: 0, COMPLETED: 0, CONFIRMED: 0, CANCELLED: 0, NO_SHOW: 0, reviews: 0 };
  const reviewQueue: { bookingId: string; userId: string; at: Date }[] = [];
  for (const [di, day] of days.entries()) {
    const weekday = new Date(day + "T00:00:00Z").getUTCDay();
    const weekend = weekday === 0 || weekday === 6 || weekday === 5;
    const growth = 0.7 + 0.3 * (di / days.length); // more bookings in recent weeks
    const busy = new Map<string, Set<number>>([[unitIds.A, new Set()], [unitIds.B, new Set()]]);
    const free = (cfg: Cfg, h: number, len: number) => cfg.units.every((u) => Array.from({ length: len }, (_, k) => h + k).every((x) => x < 25 && !busy.get(u.unitId)!.has(x)));
    const take = (cfg: Cfg, h: number, len: number) => cfg.units.forEach((u) => Array.from({ length: len }, (_, k) => busy.get(u.unitId)!.add(h + k)));

    for (let h = 6; h <= 24; h++) {
      if (day === blockDay && h < 8) continue;
      const p = (h < 9 ? 0.35 : h < 16 ? 0.08 : h < 18 ? 0.3 : h < 23 ? (weekend ? 0.92 : 0.75) : 0.4) * growth;
      for (const attempt of [0, 1]) {
        if (rand() > (attempt === 0 ? p : p * 0.6)) continue;
        const cfg = attempt === 0 ? (rand() < 0.55 ? fullCfg : pick([halfA, halfB])) : pick([halfA, halfB]);
        const len = h >= 18 && h <= 22 && rand() < 0.22 ? 2 : 1;
        if (!free(cfg, h, len)) continue;
        take(cfg, h, len);

        const startAt = istToUtc(day, h * 60);
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
        const player = online ? pick(players) : null;
        const team = online ? pick(TEAMS) : rand() < 0.3 ? pick(TEAMS) : null;
        const collected = status === "COMPLETED" && !(past && endAt.getTime() > now.getTime() - 3 * 86_400_000 && rand() < 0.35);

        const b = await prisma.booking.create({
          data: {
            code: code(),
            turfId: turf.id,
            configId: cfg.id,
            userId: player?.id ?? null,
            source,
            status,
            startAt,
            endAt,
            durationMinutes: minutes,
            totalPrice,
            advanceAmount: online ? ADVANCE : 0,
            platformFee: 0,
            onlineAmount: online ? ADVANCE : 0,
            balanceDue: online ? totalPrice - ADVANCE : totalPrice,
            balanceCollectedAt: collected ? new Date(endAt.getTime() - 15 * 60_000) : null,
            balanceCollectedBy: collected ? owner.id : null,
            policySnapshot: policy as object,
            confirmedAt: new Date(createdAt.getTime() + 60_000),
            cancelledAt: status === "CANCELLED" ? new Date(Math.min(startAt.getTime() - 30 * 3_600_000 * rand(), now.getTime())) : null,
            cancelledBy: status === "CANCELLED" ? (online ? player!.id : owner.id) : null,
            cancelReason: status === "CANCELLED" ? pick(["Team couldn't make it", "Rain", "Rescheduled to another day"]) : null,
            teamName: team,
            customerName: online ? null : pick(WALKINS),
            notes: source === "PHONE" && rand() < 0.2 ? "Called the turf" : null,
            createdAt,
          },
        });
        counts[source]++;
        counts[status]++;

        if (status !== "CANCELLED")
          await prisma.occupancy.createMany({ data: cfg.units.map((u) => ({ unitId: u.unitId, bookingId: b.id, startAt, endAt, createdAt })) });

        if (online) {
          const pay = await prisma.payment.create({
            data: {
              bookingId: b.id,
              userId: player!.id,
              provider: "mock",
              providerOrderId: `sample_order_${b.code}`,
              providerPaymentId: `sample_pay_${b.code}`,
              amount: ADVANCE,
              status: status === "CANCELLED" ? "REFUNDED" : "CAPTURED",
              method: pick(["upi", "upi", "upi", "card", "wallet"]),
              capturedAt: new Date(createdAt.getTime() + 45_000),
              refundedAmount: status === "CANCELLED" ? ADVANCE : 0,
              createdAt,
            },
          });
          await prisma.ledgerEntry.create({ data: { turfId: turf.id, bookingId: b.id, paymentId: pay.id, type: "ADVANCE_COLLECTED", amount: ADVANCE, note: "Online advance collected by platform", createdAt: new Date(createdAt.getTime() + 60_000) } });
          if (status === "CANCELLED") {
            await prisma.refund.create({ data: { paymentId: pay.id, amount: ADVANCE, status: "PROCESSED", providerRefundId: `sample_rfnd_${b.code}`, reason: "Cancelled 24 h or more before the match: full refund", createdAt: b.cancelledAt! } });
            await prisma.ledgerEntry.create({ data: { turfId: turf.id, bookingId: b.id, paymentId: pay.id, type: "REFUND", amount: -ADVANCE, note: "Cancelled 24 h or more before the match: full refund", createdAt: b.cancelledAt! } });
          }
          if (status === "COMPLETED" && rand() < 0.45) reviewQueue.push({ bookingId: b.id, userId: player!.id, at: new Date(endAt.getTime() + (2 + rand() * 20) * 3_600_000) });
        }
      }
    }
  }

  // ── Verified reviews (only players who booked and played) ──
  for (const r of reviewQueue) {
    if (r.at > now) continue;
    const overall = rand() < 0.68 ? 5 : rand() < 0.85 ? 4 : 3;
    const near = (v: number) => Math.max(3, Math.min(5, v + (rand() < 0.2 ? -1 : 0)));
    await prisma.review.create({
      data: { bookingId: r.bookingId, turfId: turf.id, userId: r.userId, overall, turfQuality: near(overall), cleanliness: near(overall), lighting: near(5), parking: near(overall), comment: pick(REVIEWS), createdAt: r.at },
    });
    counts.reviews++;
  }
  const agg = await prisma.review.aggregate({ where: { turfId: turf.id }, _avg: { overall: true }, _count: true });
  await prisma.turf.update({ where: { id: turf.id }, data: { ratingAvg: agg._avg.overall ?? 0, ratingCount: agg._count } });

  // ── A planned maintenance block (owners can close slots) ──
  const block = await prisma.slotBlock.create({
    data: { turfId: turf.id, configId: null, startAt: istToUtc(blockDay, 6 * 60), endAt: istToUtc(blockDay, 8 * 60), reason: "MAINTENANCE", note: "Turf brushing and line marking", createdById: owner.id },
  });
  await prisma.occupancy.createMany({ data: Object.values(unitIds).map((unitId) => ({ unitId, blockId: block.id, startAt: block.startAt, endAt: block.endAt })) });

  // ── The owner's latest notifications, as after real bookings ──
  const latest = await prisma.booking.findMany({ where: { turfId: turf.id, source: "ONLINE", status: "CONFIRMED" }, orderBy: { createdAt: "desc" }, take: 3 });
  for (const b of latest)
    await prisma.notification.create({ data: { userId: owner.id, title: `New booking ${b.code}`, body: turf.name, link: `/owner/bookings?focus=${b.id}`, createdAt: b.createdAt } });

  console.log(
    `Created ${turf.name}: ${counts.ONLINE + counts.PHONE + counts.WALK_IN} bookings (${counts.ONLINE} online, ${counts.PHONE} phone, ${counts.WALK_IN} walk-in; ` +
      `${counts.COMPLETED} played, ${counts.CONFIRMED} upcoming, ${counts.CANCELLED} cancelled, ${counts.NO_SHOW} no-show), ${counts.reviews} reviews, rating ${(agg._avg.overall ?? 0).toFixed(1)}.`,
  );
  console.log(`Owner login: +91 9000000001. Turf page: /turfs/${SLUG}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
