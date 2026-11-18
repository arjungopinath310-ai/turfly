import { prisma, type Tx } from "./db";
import { createNotification } from "./notifications/service";
import { getSettings } from "./settings";

/**
 * Turf coins, Turfly's loyalty points. A player earns coins for every online booking they play (coinsPerBooking,
 * 10 by default) and spends them on a booking's online advance (1 coin = coinValuePaise, ₹1 by default). Turfly
 * pays the turf the full advance, so coins cost the turf nothing. Coins can't be bought, sold, transferred or cashed
 * out (which keeps them a loyalty scheme, not a wallet). Coins spent on a booking that doesn't happen come back.
 */

export async function coinBalance(userId: string, db: Tx = prisma) {
  const a = await db.coinEntry.aggregate({ where: { userId }, _sum: { amount: true } });
  return a._sum.amount ?? 0;
}

/**
 * How many coins can go towards an online amount: whole coins, at most the balance and the amount, and never
 * leaving a remainder under ₹1 (the payment gateway's minimum).
 */
export function coinsUsable(balance: number, onlineAmountPaise: number, coinValuePaise: number) {
  if (coinValuePaise <= 0 || balance <= 0) return 0;
  let c = Math.max(0, Math.min(balance, Math.floor(onlineAmountPaise / coinValuePaise)));
  while (c > 0 && onlineAmountPaise - c * coinValuePaise > 0 && onlineAmountPaise - c * coinValuePaise < 100) c--;
  return c;
}

export async function coinHistory(userId: string, take = 12) {
  return prisma.coinEntry.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take, include: { booking: { select: { code: true } } } });
}

/** Coins spent on a booking that didn't happen (cancelled or expired) come back, once. */
export async function returnCoins(db: Tx, b: { id: string; userId: string | null; coinsUsed: number; code: string }, why: string) {
  if (!b.userId || b.coinsUsed <= 0) return 0;
  const r = await db.coinEntry.createMany({ data: [{ userId: b.userId, amount: b.coinsUsed, kind: "RETURN", bookingId: b.id, note: `${why} (${b.code})` }], skipDuplicates: true });
  return r.count ? b.coinsUsed : 0;
}

/** Cron: coins for online bookings that were played (once per booking; sample turfs earn none). */
export async function awardCoinsForPlayedBookings(limit = 500) {
  const s = await getSettings();
  if (s.coinsPerBooking <= 0) return 0;
  const rows = await prisma.booking.findMany({
    where: {
      status: "COMPLETED",
      source: "ONLINE",
      userId: { not: null },
      turf: { isDemo: false },
      endAt: { gt: new Date(Date.now() - 30 * 86_400_000) },
      coinEntries: { none: { kind: "EARN_BOOKING" } },
    },
    select: { id: true, userId: true, code: true, turf: { select: { name: true } } },
    take: limit,
  });
  let awarded = 0;
  for (const b of rows) {
    const r = await prisma.coinEntry.createMany({
      data: [{ userId: b.userId!, amount: s.coinsPerBooking, kind: "EARN_BOOKING", bookingId: b.id, note: `Played at ${b.turf.name}` }],
      skipDuplicates: true,
    });
    if (!r.count) continue;
    awarded++;
    await createNotification(prisma, {
      userId: b.userId!,
      title: `You earned ${s.coinsPerBooking} Turf coins`,
      body: `For your match at ${b.turf.name}. Use them on the online advance of your next booking.`,
      link: "/profile#coins",
    });
  }
  return awarded;
}

/** Cron: coins on holds that expired unpaid come back (after a grace period for late payment confirmations). */
export async function returnCoinsForExpiredHolds() {
  const rows = await prisma.booking.findMany({
    where: { status: "EXPIRED", coinsUsed: { gt: 0 }, holdExpiresAt: { lt: new Date(Date.now() - 30 * 60_000) }, coinEntries: { none: { kind: "RETURN" } } },
    select: { id: true, userId: true, coinsUsed: true, code: true },
    take: 500,
  });
  let n = 0;
  for (const b of rows) n += (await returnCoins(prisma, b, "Booking not completed")) ? 1 : 0;
  return n;
}
