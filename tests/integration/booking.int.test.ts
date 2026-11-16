/**
 * Integration tests against a real PostgreSQL (needs DATABASE_URL and migrations applied).
 *   npm run test:integration
 * Verifies the guarantees that unit tests can't: DB-level exclusion under concurrency,
 * the convertible-pitch rules end to end, webhook idempotency and late-payment refunds.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createHold, createBlock } from "@/lib/engine/booking";
import { convertiblePitchLayout } from "@/lib/engine/allocation";
import { applyGatewayEvent, createPaymentOrder } from "@/lib/payments/service";
import { addDays, todayIst } from "@/lib/time";

const D = addDays(todayIst(), 2);
let turfId = "";
const cfg: Record<"FULL" | "A" | "B", string> = { FULL: "", A: "", B: "" };
const users: User[] = [];
const tag = randomBytes(4).toString("hex");

async function user(i: number) {
  return prisma.user.create({ data: { phone: `+9170${tag.replace(/\D/g, "").padEnd(4, "1").slice(0, 4)}${String(i).padStart(4, "0")}`, name: `IT ${i}` } });
}
const hold = (u: User, c: keyof typeof cfg, startMinute: number, durationMinutes = 60) =>
  createHold(u, { turfId, configId: cfg[c], date: D, startMinute, durationMinutes });

async function pay(bookingId: string, u: User, eventId = `evt_${randomBytes(6).toString("hex")}`) {
  const { payment } = await createPaymentOrder(u, bookingId);
  const entity = { id: `pay_${randomBytes(6).toString("hex")}`, order_id: payment.providerOrderId, amount: payment.amount, status: "captured", method: "upi" };
  return applyGatewayEvent(eventId, "payment.captured", { payment: { entity } }, true);
}

beforeAll(async () => {
  const city = await prisma.city.upsert({ where: { slug: "it-city" }, update: {}, create: { slug: "it-city", name: "IT City", state: "KL", lat: 11, lng: 76, pincodes: [] } });
  const turf = await prisma.turf.create({
    data: { slug: `it-${tag}`, name: "IT Turf", cityId: city.id, addressLine: "x", pincode: "676121", lat: 11, lng: 76, status: "APPROVED", availabilityMode: "LIVE", minNoticeMinutes: 0, slotStepMinutes: 30 },
  });
  turfId = turf.id;
  await prisma.operatingHours.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ turfId, weekday, openMinute: 360, closeMinute: 1440 })) });
  const l = convertiblePitchLayout({ halvesSimultaneous: true, allowCombined: true, fullPricePerHour: 150000, halfPricePerHour: 90000 });
  const ids: Record<string, string> = {};
  for (const u of l.units) ids[u.key] = (await prisma.resourceUnit.create({ data: { turfId, name: u.name } })).id;
  for (const c of l.configs) {
    const row = await prisma.pitchConfig.create({ data: { turfId, name: c.name, playersPerSide: c.playersPerSide, basePricePerHour: c.basePricePerHour, units: { create: c.unitKeys.map((k) => ({ unitId: ids[k] })) } } });
    cfg[c.playersPerSide === 7 ? "FULL" : c.name.includes("A") ? "A" : "B"] = row.id;
  }
  for (let i = 0; i < 12; i++) users.push(await user(i));
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("double booking is impossible", () => {
  it("10 simultaneous requests for one slot → exactly one hold", async () => {
    const results = await Promise.allSettled(users.slice(0, 10).map((u) => hold(u, "FULL", 7 * 60)));
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason.code === "SLOT_TAKEN")).toBe(true);
  });

  it("simultaneous Full vs Half A at the same time → exactly one wins", async () => {
    const r = await Promise.allSettled([hold(users[0], "FULL", 9 * 60), hold(users[1], "A", 9 * 60)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });
});

describe("convertible pitch", () => {
  it("Half A booked → Half B free, Full blocked", async () => {
    await hold(users[2], "A", 18 * 60);
    await expect(hold(users[3], "FULL", 18 * 60)).rejects.toMatchObject({ code: "SLOT_TAKEN" });
    await expect(hold(users[3], "B", 18 * 60)).resolves.toBeTruthy();
  });

  it("A 6–7 PM + B 7–8 PM: Full blocked only where overlapping, free at 8 PM", async () => {
    await hold(users[4], "B", 19 * 60);
    await expect(hold(users[5], "FULL", 18 * 60 + 30)).rejects.toMatchObject({ code: "SLOT_TAKEN" });
    await expect(hold(users[5], "FULL", 20 * 60)).resolves.toBeTruthy();
    await expect(hold(users[6], "A", 19 * 60)).resolves.toBeTruthy(); // A is free 7–8
  });

  it("owner block on whole turf prevents bookings, and cannot overlap existing bookings", async () => {
    const owner = users[11];
    const t = await prisma.turf.findUniqueOrThrow({ where: { id: turfId } });
    const { istToUtc } = await import("@/lib/time");
    await createBlock(owner, t, { configId: null, startAt: istToUtc(D, 12 * 60), endAt: istToUtc(D, 13 * 60), reason: "MAINTENANCE" });
    await expect(hold(users[7], "B", 12 * 60)).rejects.toMatchObject({ code: "SLOT_TAKEN" });
    await expect(createBlock(owner, t, { configId: null, startAt: istToUtc(D, 18 * 60), endAt: istToUtc(D, 19 * 60), reason: "OTHER" })).rejects.toMatchObject({ code: "SLOT_TAKEN" });
  });
});

describe("payments", () => {
  it("duplicate webhook events confirm once and write one ledger entry", async () => {
    const u = users[7];
    const b = await hold(u, "A", 15 * 60);
    const evt = `evt_dupe_${tag}`;
    expect((await pay(b.id, u, evt)).status).toBe("ok");
    // replay the identical event
    const p = await prisma.payment.findFirstOrThrow({ where: { bookingId: b.id } });
    const replay = await applyGatewayEvent(evt, "payment.captured", { payment: { entity: { id: p.providerPaymentId, order_id: p.providerOrderId, amount: p.amount, status: "captured" } } }, true);
    expect(replay.status).toBe("duplicate");
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.status).toBe("CONFIRMED");
    expect(after.advanceAmount).toBe(4900);
    expect(after.balanceDue).toBe(after.totalPrice - 4900);
    expect(await prisma.ledgerEntry.count({ where: { bookingId: b.id, type: "ADVANCE_COLLECTED" } })).toBe(1);
    expect(await prisma.notificationJob.count({ where: { bookingId: b.id, template: "BOOKING_CONFIRMED" } })).toBeGreaterThan(0);
  });

  it("invalid signature is rejected and confirms nothing", async () => {
    const u = users[8];
    const b = await hold(u, "B", 15 * 60);
    const { payment } = await createPaymentOrder(u, b.id);
    const r = await applyGatewayEvent(`evt_bad_${tag}`, "payment.captured", { payment: { entity: { id: "pay_x", order_id: payment.providerOrderId, amount: payment.amount } } }, false);
    expect(r.status).toBe("rejected");
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("HELD");
  });

  it("payment after hold expiry: re-acquires if free, refunds if the slot was taken", async () => {
    const [u1, u2, u3] = [users[9], users[10], users[11]];
    // free case
    const b1 = await hold(u1, "FULL", 10 * 60);
    const o1 = await createPaymentOrder(u1, b1.id);
    await prisma.booking.update({ where: { id: b1.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    await applyGatewayEvent(`evt_late1_${tag}`, "payment.captured", { payment: { entity: { id: `pay_l1_${tag}`, order_id: o1.payment.providerOrderId, amount: o1.payment.amount } } }, true);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b1.id } })).status).toBe("CONFIRMED");

    // taken case
    const b2 = await hold(u2, "A", 11 * 60);
    const o2 = await createPaymentOrder(u2, b2.id);
    await prisma.booking.update({ where: { id: b2.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    await hold(u3, "A", 11 * 60); // sweeps the expired hold and takes the slot
    await applyGatewayEvent(`evt_late2_${tag}`, "payment.captured", { payment: { entity: { id: `pay_l2_${tag}`, order_id: o2.payment.providerOrderId, amount: o2.payment.amount } } }, true);
    const p2 = await prisma.payment.findUniqueOrThrow({ where: { providerOrderId: o2.payment.providerOrderId } });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b2.id } })).status).toBe("EXPIRED");
    expect(p2.status).toBe("REFUNDED");
    expect(p2.refundedAmount).toBe(p2.amount);
  });
});
