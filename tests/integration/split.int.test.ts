/**
 * Split payments against a real PostgreSQL (npm run test:integration).
 * Covers: share webhooks, balance + ledger, duplicate events, the race for the last share,
 * one share per person, and full refunds of shares when the booking is cancelled.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import type { Booking, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cancelBooking, createHold } from "@/lib/engine/booking";
import { convertiblePitchLayout } from "@/lib/engine/allocation";
import { applyGatewayEvent, createPaymentOrder } from "@/lib/payments/service";
import { cancelSplit, createSplit, startSharePayment } from "@/lib/split";
import { addDays, todayIst } from "@/lib/time";

const D = addDays(todayIst(), 3);
const tag = randomBytes(4).toString("hex");
let turfId = "";
let fullId = "";
const users: User[] = [];

const capture = (orderId: string, amount: number, evt = `evt_${randomBytes(6).toString("hex")}`) =>
  applyGatewayEvent(evt, "payment.captured", { payment: { entity: { id: `pay_${randomBytes(6).toString("hex")}`, order_id: orderId, amount, status: "captured", method: "upi" } } }, true);

async function confirmedBooking(organiser: User, startMinute: number): Promise<Booking> {
  const b = await createHold(organiser, { turfId, configId: fullId, date: D, startMinute, durationMinutes: 60 });
  const { payment } = await createPaymentOrder(organiser, b.id);
  await capture(payment.providerOrderId, payment.amount);
  return prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
}

async function payShare(token: string, u: User, evt?: string) {
  const { payment } = await startSharePayment(u, token);
  await capture(payment.providerOrderId, payment.amount, evt);
  return prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
}

beforeAll(async () => {
  const city = await prisma.city.upsert({ where: { slug: "it-city" }, update: {}, create: { slug: "it-city", name: "IT City", state: "KL", lat: 11, lng: 76, pincodes: [] } });
  const turf = await prisma.turf.create({
    data: { slug: `it-split-${tag}`, name: "IT Split Turf", cityId: city.id, addressLine: "x", pincode: "676121", lat: 11, lng: 76, status: "APPROVED", availabilityMode: "LIVE", minNoticeMinutes: 0, slotStepMinutes: 60 },
  });
  turfId = turf.id;
  await prisma.operatingHours.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ turfId, weekday, openMinute: 360, closeMinute: 1440 })) });
  const l = convertiblePitchLayout({ halvesSimultaneous: true, allowCombined: true, fullPricePerHour: 150000, halfPricePerHour: 90000 });
  const ids: Record<string, string> = {};
  for (const u of l.units) ids[u.key] = (await prisma.resourceUnit.create({ data: { turfId, name: u.name } })).id;
  for (const c of l.configs) {
    const row = await prisma.pitchConfig.create({ data: { turfId, name: c.name, playersPerSide: c.playersPerSide, basePricePerHour: c.basePricePerHour, units: { create: c.unitKeys.map((k) => ({ unitId: ids[k] })) } } });
    if (c.playersPerSide === 7) fullId = row.id;
  }
  // unique per run: earlier runs leave their users in the test database
  const stamp = String(Date.now()).slice(-7);
  for (let i = 0; i < 8; i++) users.push(await prisma.user.create({ data: { phone: `+9172${stamp}${i}`, name: `Split ${i}` } }));
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("split payments", () => {
  it("a friend's share is confirmed by the webhook: balance, ledger, squad and notification", async () => {
    const [org, f1] = users;
    const b = await confirmedBooking(org, 8 * 60);
    expect(b.balanceDue).toBe(150000);
    const plan = await createSplit(org, b.id, 10); // ₹150 each, 9 friends
    expect(plan.shareAmount).toBe(15000);
    expect(plan.shares).toHaveLength(9);

    const evt = `evt_share_${tag}`;
    const p = await payShare(plan.token, f1, evt);
    expect(p.status).toBe("CAPTURED");
    // replaying the same webhook changes nothing
    expect((await applyGatewayEvent(evt, "payment.captured", {}, true)).status).toBe("duplicate");

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.balanceDue).toBe(150000 - 15000);
    expect(after.splitCollected).toBe(15000);
    expect(await prisma.splitShare.count({ where: { planId: plan.id, status: "PAID", paidById: f1.id } })).toBe(1);
    expect(await prisma.ledgerEntry.count({ where: { bookingId: b.id, type: "SPLIT_COLLECTED", amount: 15000 } })).toBe(1);
    expect(await prisma.matchPlayer.count({ where: { bookingId: b.id, userId: f1.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: org.id, title: { contains: "paid their share" } } })).toBe(1);

    // one share per person; organiser can't pay a share; split can't change once someone paid
    await expect(startSharePayment(f1, plan.token)).rejects.toThrow(/already paid/);
    await expect(startSharePayment(org, plan.token)).rejects.toThrow(/organised/);
    await expect(createSplit(org, b.id, 5)).rejects.toThrow(/already paid/);
    await expect(cancelSplit(org, b.id)).rejects.toThrow(/already paid/);
  });

  it("race for the last share: one claim at a time, a late payment is refunded in full", async () => {
    const [org, f1, f2, f3] = [users[1], users[2], users[3], users[4]];
    const b = await confirmedBooking(org, 10 * 60);
    const plan = await createSplit(org, b.id, 2); // exactly one share (₹750)
    const first = await startSharePayment(f1, plan.token);
    await expect(startSharePayment(f2, plan.token)).rejects.toThrow(/being paid/);

    // f1 walks away; their claim expires and f2 takes and pays the share
    await prisma.splitShare.updateMany({ where: { planId: plan.id }, data: { claimExpiresAt: new Date(Date.now() - 1000) } });
    const p2 = await payShare(plan.token, f2);
    expect(p2.status).toBe("CAPTURED");
    // f1 completes the old checkout anyway → refunded, nothing double-counted
    await capture(first.payment.providerOrderId, first.payment.amount);
    const p1 = await prisma.payment.findUniqueOrThrow({ where: { id: first.payment.id } });
    expect(p1.status).toBe("REFUNDED");
    expect(p1.refundedAmount).toBe(p1.amount);
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.splitCollected).toBe(plan.shareAmount);
    expect(await prisma.ledgerEntry.count({ where: { bookingId: b.id, type: "SPLIT_COLLECTED" } })).toBe(1);
    await expect(startSharePayment(f3, plan.token)).rejects.toThrow(/being paid/);
  });

  it("parallel payers each get a different share", async () => {
    const org = users[5];
    const b = await confirmedBooking(org, 12 * 60);
    const plan = await createSplit(org, b.id, 4); // 3 shares
    const res = await Promise.all([users[0], users[1], users[2]].map((u) => startSharePayment(u, plan.token)));
    expect(new Set(res.map((r) => r.payment.splitShareId)).size).toBe(3);
  });

  it("cancelling the booking refunds the organiser by policy and every friend in full", async () => {
    const [org, f1, f2] = [users[6], users[7], users[0]];
    const b = await confirmedBooking(org, 14 * 60);
    const plan = await createSplit(org, b.id, 3); // ₹500 each
    await payShare(plan.token, f1);
    await payShare(plan.token, f2);
    await cancelBooking(org, b.id, "Rain", "customer");

    const shares = await prisma.payment.findMany({ where: { bookingId: b.id, purpose: "SPLIT_SHARE" } });
    expect(shares).toHaveLength(2);
    expect(shares.every((p) => p.status === "REFUNDED" && p.refundedAmount === p.amount)).toBe(true);
    expect(await prisma.splitShare.count({ where: { planId: plan.id, status: "REFUNDED" } })).toBe(2);
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.splitCollected).toBe(0);
    const ledger = await prisma.ledgerEntry.findMany({ where: { bookingId: b.id, type: { in: ["SPLIT_COLLECTED", "REFUND"] }, paymentId: { in: shares.map((s) => s.id) } } });
    expect(ledger.reduce((t, l) => t + l.amount, 0)).toBe(0);
    // the organiser's advance refund is unaffected by the shares (policy-based, own payment only)
    const adv = await prisma.payment.findFirstOrThrow({ where: { bookingId: b.id, purpose: { not: "SPLIT_SHARE" } } });
    expect(adv.refundedAmount).toBeLessThanOrEqual(adv.amount);
    // the link is closed
    await expect(startSharePayment(users[3], plan.token)).rejects.toThrow(/closed/);
  });

  it("refuses splits that would ask friends for more than the balance", async () => {
    const org = users[4];
    const b = await confirmedBooking(org, 16 * 60);
    await expect(createSplit(org, b.id, 31)).rejects.toThrow();
    await prisma.booking.update({ where: { id: b.id }, data: { balanceCollectedAt: new Date() } });
    await expect(createSplit(org, b.id, 4)).rejects.toThrow(/already been paid/);
  });
});
