import { prisma } from "./db";
import { addDays, IST_OFFSET_MIN, istToUtc, isValidDate, todayIst } from "./time";

/**
 * Owner analytics.
 *
 * Utilisation is measured on physical *areas* (resource units), not on bookable pitches, because pitches overlap
 * (a Full 7-a-side hour uses Half A and Half B). So: utilisation = booked area-hours ÷ open area-hours,
 * where open area-hours exclude time the owner blocked. A full-pitch hour therefore counts as 2 area-hours.
 * Everything else is grouped by match date (startAt) in IST.
 */

const HOUR = 3_600_000;
const ACTIVE = ["CONFIRMED", "COMPLETED", "NO_SHOW"] as const;

export interface Range {
  from: string; // YYYY-MM-DD (IST), inclusive
  to: string; // inclusive
}

export function resolveRange(sp: { range?: string; from?: string; to?: string }, today = todayIst()): Range & { key: string; label: string } {
  const presets: Record<string, () => Range & { label: string }> = {
    "7d": () => ({ from: addDays(today, -6), to: today, label: "Last 7 days" }),
    "30d": () => ({ from: addDays(today, -29), to: today, label: "Last 30 days" }),
    "90d": () => ({ from: addDays(today, -89), to: today, label: "Last 90 days" }),
    mtd: () => ({ from: today.slice(0, 8) + "01", to: today, label: "This month" }),
    last_month: () => {
      const firstThis = today.slice(0, 8) + "01";
      const lastPrev = addDays(firstThis, -1);
      return { from: lastPrev.slice(0, 8) + "01", to: lastPrev, label: "Last month" };
    },
    next30: () => ({ from: today, to: addDays(today, 29), label: "Next 30 days (upcoming)" }),
  };
  if (sp.range === "custom" && sp.from && sp.to && isValidDate(sp.from) && isValidDate(sp.to) && sp.from <= sp.to) {
    const days = daysBetween(sp.from, sp.to);
    const to = days > 366 ? addDays(sp.from, 365) : sp.to;
    return { from: sp.from, to, key: "custom", label: `${sp.from} → ${to}` };
  }
  const key = sp.range && presets[sp.range] ? sp.range : "30d";
  return { ...presets[key](), key };
}

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000) + 1;

export function previousRange(r: Range): Range {
  const n = daysBetween(r.from, r.to);
  return { from: addDays(r.from, -n), to: addDays(r.from, -1) };
}

const istWeekdayHour = (ms: number) => {
  const d = new Date(ms + IST_OFFSET_MIN * 60_000);
  return { weekday: d.getUTCDay(), hour: d.getUTCHours() };
};

/** Split [start, end) into IST clock-hour buckets: weekday 0–6, hour 0–23, hours (fraction of an hour). Pure. */
export function hourBuckets(start: number, end: number): { weekday: number; hour: number; hours: number }[] {
  const out: { weekday: number; hour: number; hours: number }[] = [];
  let t = start;
  while (t < end) {
    const next = Math.min(end, Math.floor((t + IST_OFFSET_MIN * 60_000) / HOUR) * HOUR + HOUR - IST_OFFSET_MIN * 60_000);
    out.push({ ...istWeekdayHour(t), hours: (next - t) / HOUR });
    t = next;
  }
  return out;
}

/** Hours before this belong to the previous evening's operating day (a Friday 12–1 AM slot is Friday night). */
export const OPERATING_DAY_START_HOUR = 5;
const opDay = (b: { weekday: number; hour: number }) => (b.hour < OPERATING_DAY_START_HOUR ? (b.weekday + 6) % 7 : b.weekday);

export const emptyGrid = () => Array.from({ length: 7 }, () => new Array<number>(24).fill(0));

/** Lead-time buckets: how far ahead of the match the booking was made. */
export function leadBucket(createdAt: Date, startAt: Date): string {
  const days = (startAt.getTime() - createdAt.getTime()) / 86_400_000;
  if (days < 1) return "Same day";
  if (days < 3) return "1–2 days";
  if (days < 8) return "3–7 days";
  return "8+ days";
}
export const LEAD_ORDER = ["Same day", "1–2 days", "3–7 days", "8+ days"];

export const pctChange = (cur: number, prev: number) => (prev === 0 ? (cur === 0 ? 0 : null) : ((cur - prev) / prev) * 100);

async function core(turfId: string, r: Range) {
  const startUtc = istToUtc(r.from, 0);
  const endUtc = istToUtc(addDays(r.to, 1), 0);
  const s = startUtc.getTime();
  const e = endUtc.getTime();

  const [bookings, cancelled, units, hours, occ, reviews] = await Promise.all([
    prisma.booking.findMany({
      where: { turfId, status: { in: [...ACTIVE] }, startAt: { gte: startUtc, lt: endUtc } },
      select: {
        id: true, code: true, startAt: true, endAt: true, createdAt: true, durationMinutes: true, status: true, source: true,
        totalPrice: true, discount: true, advanceAmount: true, balanceDue: true, balanceCollectedAt: true, splitCollected: true,
        userId: true, teamName: true, customerName: true, configId: true,
        team: { select: { name: true } }, user: { select: { name: true } }, config: { select: { name: true } },
      },
      orderBy: { startAt: "asc" },
    }),
    prisma.booking.count({ where: { turfId, status: "CANCELLED", startAt: { gte: startUtc, lt: endUtc } } }),
    prisma.resourceUnit.findMany({ where: { turfId, isVirtual: false }, select: { id: true } }),
    prisma.operatingHours.findMany({ where: { turfId } }),
    prisma.occupancy.findMany({
      where: {
        released: false,
        unit: { turfId, isVirtual: false },
        startAt: { lt: endUtc },
        endAt: { gt: startUtc },
        OR: [{ blockId: { not: null } }, { booking: { status: { in: [...ACTIVE] } } }],
      },
      select: { startAt: true, endAt: true, blockId: true },
    }),
    prisma.review.findMany({ where: { turfId, createdAt: { gte: startUtc, lt: endUtc } }, select: { overall: true } }),
  ]);

  // ── utilisation (area-hours) ──
  const openGrid = emptyGrid();
  const bookedGrid = emptyGrid();
  const blockedGrid = emptyGrid();
  const nUnits = units.length;
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) {
    const wd = new Date(d + "T00:00:00Z").getUTCDay();
    const h = hours.find((x) => x.weekday === wd);
    if (!h || h.isClosed) continue;
    for (const b of hourBuckets(istToUtc(d, h.openMinute).getTime(), istToUtc(d, h.closeMinute).getTime())) openGrid[opDay(b)][b.hour] += b.hours * nUnits;
  }
  for (const o of occ) {
    const a = Math.max(s, o.startAt.getTime());
    const b = Math.min(e, o.endAt.getTime());
    if (a >= b) continue;
    for (const x of hourBuckets(a, b)) (o.blockId ? blockedGrid : bookedGrid)[opDay(x)][x.hour] += x.hours;
  }
  const sum = (g: number[][]) => g.reduce((t, row) => t + row.reduce((u, v) => u + v, 0), 0);
  const openHours = sum(openGrid);
  const blockedHours = sum(blockedGrid);
  const bookedAreaHours = sum(bookedGrid);
  const availableHours = Math.max(0, openHours - blockedHours);
  const utilisation = availableHours > 0 ? bookedAreaHours / availableHours : 0;

  // ── money & counts (by match date) ──
  const value = bookings.reduce((t, b) => t + b.totalPrice - b.discount, 0);
  const online = bookings.reduce((t, b) => t + b.advanceAmount + b.splitCollected, 0);
  // Money taken at the turf = booking value − paid online (advance + friends' split shares) − whatever is still owed.
  // Covers balances marked collected later AND walk-ins who paid (fully or partly) at the counter.
  const atVenue = bookings.reduce((t, b) => {
    const owed = b.balanceCollectedAt ? 0 : b.balanceDue;
    return t + Math.max(0, b.totalPrice - b.discount - b.advanceAmount - b.splitCollected - owed);
  }, 0);
  const pending = bookings.filter((b) => !b.balanceCollectedAt && b.status !== "NO_SHOW").reduce((t, b) => t + b.balanceDue, 0);
  const noShows = bookings.filter((b) => b.status === "NO_SHOW").length;
  const bookedHours = bookings.reduce((t, b) => t + b.durationMinutes / 60, 0);
  const cancelRate = bookings.length + cancelled ? cancelled / (bookings.length + cancelled) : 0;
  const avgRating = reviews.length ? reviews.reduce((t, x) => t + x.overall, 0) / reviews.length : null;

  return { startUtc, endUtc, bookings, cancelled, openGrid, bookedGrid, blockedGrid, openHours, blockedHours, bookedAreaHours, utilisation, value, online, atVenue, pending, noShows, bookedHours, cancelRate, avgRating, reviewsCount: reviews.length, nUnits };
}

export async function turfAnalytics(turfId: string, r: Range) {
  const [cur, prev] = await Promise.all([core(turfId, r), core(turfId, previousRange(r))]);

  // daily series
  const daily: { date: string; value: number; count: number }[] = [];
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) daily.push({ date: d, value: 0, count: 0 });
  const idx = new Map(daily.map((x, i) => [x.date, i]));
  for (const b of cur.bookings) {
    const d = new Date(b.startAt.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
    const i = idx.get(d);
    if (i != null) {
      daily[i].value += b.totalPrice - b.discount;
      daily[i].count += 1;
    }
  }

  // heatmap: utilisation per weekday × hour (null where never open)
  const heat = cur.openGrid.map((row, wd) =>
    row.map((open, h) => {
      const avail = open - cur.blockedGrid[wd][h];
      return open <= 0 ? null : avail <= 0 ? 0 : Math.min(1, cur.bookedGrid[wd][h] / avail);
    }),
  );

  // by pitch
  const byPitchMap = new Map<string, { name: string; bookings: number; hours: number; value: number }>();
  for (const b of cur.bookings) {
    const row = byPitchMap.get(b.configId) ?? { name: b.config.name, bookings: 0, hours: 0, value: 0 };
    row.bookings += 1;
    row.hours += b.durationMinutes / 60;
    row.value += b.totalPrice - b.discount;
    byPitchMap.set(b.configId, row);
  }
  const byPitch = [...byPitchMap.values()].sort((a, b) => b.hours - a.hours);

  // source split
  const sources = (["ONLINE", "WALK_IN", "PHONE"] as const).map((k) => ({ key: k, label: k === "ONLINE" ? "Online" : k === "WALK_IN" ? "Walk-in" : "Phone", count: cur.bookings.filter((b) => b.source === k).length }));

  // lead time (online bookings only — walk-ins are entered at the counter)
  const leadCounts = new Map(LEAD_ORDER.map((k) => [k, 0]));
  for (const b of cur.bookings.filter((x) => x.source === "ONLINE")) leadCounts.set(leadBucket(b.createdAt, b.startAt), (leadCounts.get(leadBucket(b.createdAt, b.startAt)) ?? 0) + 1);
  const lead = LEAD_ORDER.map((k) => ({ label: k, count: leadCounts.get(k) ?? 0 }));

  // customers: repeat share and top teams
  const customers = new Map<string, { label: string; bookings: number; value: number }>();
  for (const b of cur.bookings) {
    const key = b.userId ? `u:${b.userId}` : `n:${(b.customerName ?? "Walk-in").toLowerCase()}`;
    const label = b.teamName ?? b.team?.name ?? b.user?.name ?? b.customerName ?? "Walk-in customer";
    const row = customers.get(key) ?? { label, bookings: 0, value: 0 };
    row.bookings += 1;
    row.value += b.totalPrice - b.discount;
    customers.set(key, row);
  }
  const userIds = [...new Set(cur.bookings.map((b) => b.userId).filter(Boolean))] as string[];
  const lifetime = userIds.length
    ? await prisma.booking.groupBy({ by: ["userId"], where: { turfId, userId: { in: userIds }, status: { in: [...ACTIVE] }, startAt: { lt: cur.endUtc } }, _count: true })
    : [];
  const repeatCustomers = lifetime.filter((x) => x._count >= 2).length;
  const top = [...customers.values()].sort((a, b) => b.bookings - a.bookings || b.value - a.value).slice(0, 8);

  const kpi = (c: typeof cur) => ({
    bookings: c.bookings.length,
    bookedHours: c.bookedHours,
    utilisation: c.utilisation,
    value: c.value,
    online: c.online,
    atVenue: c.atVenue,
    pending: c.pending,
    cancelled: c.cancelled,
    cancelRate: c.cancelRate,
    noShows: c.noShows,
    avgRating: c.avgRating,
  });

  return {
    range: r,
    kpis: kpi(cur),
    prev: kpi(prev),
    reviewsCount: cur.reviewsCount,
    repeat: { customers: userIds.length, repeatCustomers },
    capacity: { openHours: cur.openHours, blockedHours: cur.blockedHours, bookedAreaHours: cur.bookedAreaHours, areas: cur.nUnits },
    daily,
    heat,
    byPitch,
    sources,
    lead,
    top,
    bookingRows: cur.bookings,
  };
}

export type TurfAnalytics = Awaited<ReturnType<typeof turfAnalytics>>;
