/**
 * Owner pricing and Turf coins against a real PostgreSQL (npm run test:integration).
 * Pricing: free period from the first online booking, then a flat fee per online booking capped per month, given
 * back on cancellation. Coins: spent on the online advance (Turfly covers it in the turf's ledger), returned when a
 * booking doesn't happen, earned once per played online booking.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomInt } from "node:crypto";
import type { Booking, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cancelBooking, confirmFromPayment, createHold } from "@/lib/engine/booking";
import { convertiblePitchLayout } from "@/lib/engine/allocation";
import { applyGatewayEvent, createPaymentOrder } from "@/lib/payments/service";
import { awardCoinsForPlayedBookings, coinBalance } from "@/lib/coins";
import { getSettings } from "@/lib/settings";
import { addDays, todayIst } from "@/lib/time";

const D = addDays(todayIst(), 5);
const tag = randomBytes(4).toString("hex");
let turfId = "";
let fiveId = "";
let player: User;

const capture = (orderId: string, amount: number) =>
  applyGatewayEvent(`evt_${randomBytes(6).toString("hex")}`, "payment.captured", { payment: { entity: { id: `pay_${randomBytes(6).toString("hex")}`, order_id: orderId, amount, status: "captured", method: "upi" } } }, true);

async function paidBooking(startMinute: number, useCoins = false): Promise<Booking> {
  const b = await createHold(player, { turfId, configId: fiveId, date: D, startMinute, durationMinutes: 60, useCoins });
  if (b.onlineAmount > 0) {
    const { payment } = await createPaymentOrder(player, b.id);
    await capture(payment.providerOrderId, payment.amount);
  } else await confirmFromPayment(b.id);
  return prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
}
const fees = (bookingId: string) => prisma.ledgerEntry.aggregate({ where: { bookingId, type: "COMMISSION" }, _sum: { amount: true } }).then((a) => a._sum.amount ?? 0);

beforeAll(async () => {
  const city = await prisma.city.upsert({ where: { slug: "it-city" }, update: {}, create: { slug: "it-city", name: "IT City", state: "KL", lat: 11, lng: 76, pincodes: [] } });
  const turf = await prisma.turf.create({
    data: { slug: `it-fees-${tag}`, name: "IT Fees Turf", cityId: city.id, addressLine: "x", pincode: "676121", lat: 11, lng: 76, status: "APPROVED", availabilityMode: "LIVE", minNoticeMinutes: 0, slotStepMinutes: 60 },
  });
  turfId = turf.id;
  await prisma.operatingHours.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ turfId, weekday, openMinute: 360, closeMinute: 1440 })) });
  const l = convertiblePitchLayout({ halvesSimultaneous: true, allowCombined: true, fullPricePerHour: 150000, halfPricePerHour: 100000 });
  const ids: Record<string, string> = {};
  for (const u of l.units) ids[u.key] = (await prisma.resourceUnit.create({ data: { turfId, name: u.name } })).id;
  for (const c of l.configs) {
    const row = await prisma.pitchConfig.create({ data: { turfId, name: c.name, playersPerSide: c.playersPerSide, basePricePerHour: c.basePricePerHour, units: { create: c.unitKeys.map((k) => ({ unitId: ids[k] })) } } });
    if (c.playersPerSide === 5 && !fiveId) fiveId = row.id;
  }
  player = await prisma.user.create({ data: { phone: `+917${String(randomInt(0, 1e9)).padStart(9, "0")}`, name: `Fees ${tag}` } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("owner pricing", () => {
  it("the first online booking starts the free period: no fee", async () => {
    const s = await getSettings();
    const b = await paidBooking(7 * 60);
    const turf = await prisma.turf.findUniqueOrThrow({ where: { id: turfId } });
    const days = (turf.freeUntil!.getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(s.freeTrialDays);
    expect(await fees(b.id)).toBe(0);
  });

  it("after the free period: a flat fee per online booking, capped per month, given back on cancellation", async () => {
    const s = await getSettings();
    await prisma.turf.update({ where: { id: turfId }, data: { freeUntil: new Date(Date.now() - 1000) } });
    const b1 = await paidBooking(8 * 60);
    expect(await fees(b1.id)).toBe(-s.onlineBookingFeePaise);

    // nearly at the cap: only the rest of the cap is charged, then nothing
    const already = s.onlineBookingFeePaise;
    await prisma.ledgerEntry.create({ data: { turfId, type: "COMMISSION", amount: -(s.monthlyFeeCapPaise - already - 1000), note: "test: earlier fees this month" } });
    const b2 = await paidBooking(9 * 60);
    expect(await fees(b2.id)).toBe(-1000);
    const b3 = await paidBooking(10 * 60);
    expect(await fees(b3.id)).toBe(0);

    await cancelBooking(player, b1.id, "Plans changed", "customer");
    expect(await fees(b1.id)).toBe(0);
  });
});

describe("Turf coins", () => {
  it("coins pay the whole advance: confirmed without the gateway, the turf still gets the full advance", async () => {
    await prisma.coinEntry.create({ data: { userId: player.id, amount: 60, kind: "ADJUST", note: "test grant" } });
    const b = await paidBooking(11 * 60, true);
    expect(b).toMatchObject({ status: "CONFIRMED", onlineAmount: 0, coinsUsed: 49, coinsValue: 4900 });
    const owed = await prisma.ledgerEntry.findFirstOrThrow({ where: { bookingId: b.id, type: "ADVANCE_COLLECTED" } });
    expect(owed.amount).toBe(4900);
    expect(await prisma.payment.count({ where: { bookingId: b.id } })).toBe(0);
    expect(await coinBalance(player.id)).toBe(11);
  });

  it("part of the advance with coins; a hold that is abandoned gives the coins back", async () => {
    const b = await createHold(player, { turfId, configId: fiveId, date: D, startMinute: 12 * 60, durationMinutes: 60, useCoins: true });
    expect(b).toMatchObject({ coinsUsed: 11, onlineAmount: 3800 });
    expect(await coinBalance(player.id)).toBe(0);
    await cancelBooking(player, b.id, "Changed my mind", "customer");
    expect(await coinBalance(player.id)).toBe(11);
  });

  it("coins are earned once per played online booking", async () => {
    const s = await getSettings();
    const b = await paidBooking(13 * 60);
    await prisma.booking.update({ where: { id: b.id }, data: { status: "COMPLETED" } });
    const before = await coinBalance(player.id);
    await awardCoinsForPlayedBookings();
    expect(await coinBalance(player.id)).toBe(before + s.coinsPerBooking);
    await awardCoinsForPlayedBookings();
    expect(await coinBalance(player.id)).toBe(before + s.coinsPerBooking);
    expect(await prisma.notification.count({ where: { userId: player.id, link: "/profile#coins" } })).toBeGreaterThanOrEqual(1);
  });
});
