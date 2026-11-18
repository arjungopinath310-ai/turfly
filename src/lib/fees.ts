import type { Turf } from "@prisma/client";
import { prisma, type Tx } from "./db";
import { getSettings } from "./settings";
import { istToUtc, todayIst } from "./time";

/**
 * What Turfly charges a turf owner (built for small Indian turfs: no monthly bill to chase, pay only for bookings
 * Turfly brings):
 * - Walk-in and phone bookings: never any fee.
 * - A free period (freeTrialDays, 90 by default) that starts with the turf's first online booking.
 * - After it: a flat fee per online booking (₹30 by default), capped per calendar month (₹499 by default), so a busy
 *   turf pays at most the cap. It is taken from the online advance Turfly already holds for the turf (a line in the
 *   turf's ledger), so there is nothing to invoice. A cancelled booking's fee is given back.
 * - Sample turfs pay nothing.
 */

type FeeTurf = Pick<Turf, "id" | "freeUntil" | "isDemo">;

const monthStart = (at: Date) => istToUtc(todayIst(at).slice(0, 8) + "01", 0);

async function feesThisMonth(db: Tx, turfId: string, at: Date) {
  const agg = await db.ledgerEntry.aggregate({ where: { turfId, type: "COMMISSION", createdAt: { gte: monthStart(at) } }, _sum: { amount: true } });
  return -(agg._sum.amount ?? 0);
}

/** Called once per confirmed online booking (inside its confirmation). Returns the fee charged, in paise. */
export async function chargeOnlineBookingFee(db: Tx, turf: FeeTurf, bookingId: string, at = new Date()) {
  if (turf.isDemo) return 0;
  const s = await getSettings();
  let freeUntil = turf.freeUntil;
  if (!freeUntil) {
    freeUntil = new Date(at.getTime() + s.freeTrialDays * 86_400_000);
    await db.turf.update({ where: { id: turf.id }, data: { freeUntil } });
  }
  if (at < freeUntil) return 0;
  const fee = Math.max(0, Math.min(s.onlineBookingFeePaise, s.monthlyFeeCapPaise - (await feesThisMonth(db, turf.id, at))));
  if (fee > 0)
    await db.ledgerEntry.create({
      data: { turfId: turf.id, bookingId, type: "COMMISSION", amount: -fee, note: fee < s.onlineBookingFeePaise ? "Turfly fee (monthly cap reached)" : "Turfly fee for an online booking" },
    });
  return fee;
}

/** A cancelled online booking costs the turf nothing: its fee is given back, once. */
export async function returnOnlineBookingFee(db: Tx, bookingId: string) {
  const entries = await db.ledgerEntry.findMany({ where: { bookingId, type: "COMMISSION" } });
  const net = entries.reduce((a, e) => a + e.amount, 0);
  if (net >= 0 || !entries[0]) return 0;
  await db.ledgerEntry.create({ data: { turfId: entries[0].turfId, bookingId, type: "COMMISSION", amount: -net, note: "Turfly fee returned: booking cancelled" } });
  return -net;
}

/** The owner's plan, as shown on their dashboard. */
export async function turfPlan(turf: FeeTurf, now = new Date()) {
  const s = await getSettings();
  return {
    sample: turf.isDemo,
    freeUntil: turf.freeUntil,
    inFreePeriod: !turf.freeUntil || now < turf.freeUntil,
    freeTrialDays: s.freeTrialDays,
    feePaise: s.onlineBookingFeePaise,
    capPaise: s.monthlyFeeCapPaise,
    chargedThisMonth: await feesThisMonth(prisma, turf.id, now),
  };
}
