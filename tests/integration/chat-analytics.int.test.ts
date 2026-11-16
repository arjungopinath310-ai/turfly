/**
 * Integration tests (real PostgreSQL): hourly slot grid, player ↔ owner chat permissions & unread counts,
 * and analytics utilisation maths. Run with `npm run test:integration`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { convertiblePitchLayout } from "@/lib/engine/allocation";
import { createBlock, createHold, createManualBooking } from "@/lib/engine/booking";
import { listConversations, loadConversationFor, markRead, sendMessage, startAsOwner, startAsPlayer, threadMessages, unreadMessageCount } from "@/lib/chat";
import { turfAnalytics } from "@/lib/analytics";
import { addDays, istToUtc, todayIst } from "@/lib/time";

const D = addDays(todayIst(), 3);
const tag = randomBytes(3).toString("hex");
let n = 0;
const mkUser = (role: "PLAYER" | "OWNER" | "ADMIN" = "PLAYER") =>
  prisma.user.create({ data: { phone: `+9160${String(Date.now()).slice(-4)}${String(n++).padStart(4, "0")}`, name: `U${n}-${tag}`, role } });

let owner: User, player: User, other: User, admin: User;
let turfId = "", unclaimedId = "";
const cfg: Record<"FULL" | "A" | "B", string> = { FULL: "", A: "", B: "" };

beforeAll(async () => {
  [owner, player, other, admin] = [await mkUser("OWNER"), await mkUser(), await mkUser(), await mkUser("ADMIN")];
  const city = await prisma.city.upsert({ where: { slug: "it-city" }, update: {}, create: { slug: "it-city", name: "IT City", state: "KL", lat: 11, lng: 76, pincodes: [] } });
  // created with schema defaults → must be the 1-hour grid
  const turf = await prisma.turf.create({
    data: { slug: `it2-${tag}`, name: "IT Chat Turf", cityId: city.id, addressLine: "x", pincode: "676121", lat: 11, lng: 76, status: "APPROVED", availabilityMode: "LIVE", minNoticeMinutes: 0, ownerId: owner.id },
  });
  turfId = turf.id;
  unclaimedId = (await prisma.turf.create({ data: { slug: `it2u-${tag}`, name: "Unclaimed", cityId: city.id, addressLine: "x", pincode: "676121", lat: 11, lng: 76, status: "UNCLAIMED", availabilityMode: "NONE" } })).id;
  await prisma.operatingHours.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ turfId, weekday, openMinute: 360, closeMinute: 1440 })) });
  const l = convertiblePitchLayout({ halvesSimultaneous: true, allowCombined: true, fullPricePerHour: 150000, halfPricePerHour: 90000 });
  const ids: Record<string, string> = {};
  for (const u of l.units) ids[u.key] = (await prisma.resourceUnit.create({ data: { turfId, name: u.name } })).id;
  for (const c of l.configs) {
    const row = await prisma.pitchConfig.create({ data: { turfId, name: c.name, playersPerSide: c.playersPerSide, basePricePerHour: c.basePricePerHour, units: { create: c.unitKeys.map((k) => ({ unitId: ids[k] })) } } });
    cfg[c.playersPerSide === 7 ? "FULL" : c.name.includes("A") ? "A" : "B"] = row.id;
  }
});

describe("1-hour slots", () => {
  it("new turfs default to a 60-minute grid with 60/120-minute bookings", async () => {
    const t = await prisma.turf.findUniqueOrThrow({ where: { id: turfId } });
    expect(t.slotStepMinutes).toBe(60);
    expect(t.allowedDurations).toEqual([60, 120]);
  });
  it("rejects half-hour starts and 90-minute bookings", async () => {
    await expect(createHold(player, { turfId, configId: cfg.A, date: D, startMinute: 18 * 60 + 30, durationMinutes: 60 })).rejects.toThrow(/Invalid start time/);
    await expect(createHold(player, { turfId, configId: cfg.A, date: D, startMinute: 18 * 60, durationMinutes: 90 })).rejects.toThrow(/Unsupported duration/);
  });
});

describe("chat", () => {
  it("player starts a chat; owner gets an unread message and a notification", async () => {
    const c = await startAsPlayer(player, turfId);
    await sendMessage(player, c.id, "  Is there parking for 6 bikes?  ");
    expect(await unreadMessageCount(owner.id)).toBe(1);
    expect(await unreadMessageCount(player.id)).toBe(0);
    const list = await listConversations(owner);
    expect(list[0]).toMatchObject({ role: "owner", title: player.name, unread: 1, lastMessageText: "Is there parking for 6 bikes?" });
    expect(await prisma.notification.count({ where: { userId: owner.id, link: `/messages?c=${c.id}`, readAt: null } })).toBe(1);
    // a second message doesn't create a second notification while the first is unread
    await sendMessage(player, c.id, "And drinking water?");
    expect(await prisma.notification.count({ where: { userId: owner.id, link: `/messages?c=${c.id}` } })).toBe(1);
    await markRead(owner, c.id);
    expect(await unreadMessageCount(owner.id)).toBe(0);
    await sendMessage(owner, c.id, "Yes to both 👍");
    const t = await threadMessages(player, c.id);
    expect(t.messages.map((m) => [m.mine, m.senderLabel])).toEqual([[true, "You"], [true, "You"], [false, "IT Chat Turf"]]);
    // starting again reuses the same thread
    expect((await startAsPlayer(player, turfId)).id).toBe(c.id);
  });

  it("outsiders, and even admins, cannot read someone else's chat", async () => {
    const c = await startAsPlayer(player, turfId);
    await expect(loadConversationFor(other, c.id)).rejects.toMatchObject({ status: 404 });
    await expect(loadConversationFor(admin, c.id)).rejects.toMatchObject({ status: 404 });
    await expect(sendMessage(other, c.id, "hi")).rejects.toMatchObject({ status: 404 });
  });

  it("owners can only message players who booked their turf", async () => {
    await expect(startAsOwner(owner, turfId, other.id)).rejects.toThrow(/booked this turf/);
    await createHold(other, { turfId, configId: cfg.B, date: D, startMinute: 7 * 60, durationMinutes: 60 });
    const c = await startAsOwner(owner, turfId, other.id);
    expect(c.playerId).toBe(other.id);
    await expect(startAsOwner(player, turfId, other.id)).rejects.toThrow(/turf's owner/);
  });

  it("unclaimed turfs can't be messaged; bodies are validated and rate-limited", async () => {
    await expect(startAsPlayer(player, unclaimedId)).rejects.toThrow(/call them/);
    const c = await startAsPlayer(player, turfId);
    await expect(sendMessage(player, c.id, "   ")).rejects.toThrow(/Type a message/);
    await expect(sendMessage(player, c.id, "x".repeat(1001))).rejects.toThrow(/at most 1000/);
    const spammer = await mkUser();
    const s = await startAsPlayer(spammer, turfId);
    for (let i = 0; i < 20; i++) await sendMessage(spammer, s.id, `msg ${i}`);
    await expect(sendMessage(spammer, s.id, "one more")).rejects.toMatchObject({ status: 429 });
  });
});

describe("analytics", () => {
  it("measures utilisation in area-hours, excluding blocked time", async () => {
    // Full 7s 6–7 PM (uses both halves = 2 area-hours) + Pitch A 7–8 PM (1 area-hour)
    await createManualBooking(owner, { turfId, configId: cfg.FULL, date: D, startMinute: 18 * 60, durationMinutes: 60, customerName: "Walk-in FC", source: "WALK_IN", amountCollected: 1500 * 100 });
    await createManualBooking(owner, { turfId, configId: cfg.A, date: D, startMinute: 19 * 60, durationMinutes: 60, customerName: "Phone FC", source: "PHONE" });
    const before = await turfAnalytics(turfId, { from: D, to: D });
    // open 6:00–24:00 = 18 h × 2 areas = 36 area-hours; booked 3
    expect(before.capacity.openHours).toBe(36);
    expect(before.capacity.bookedAreaHours).toBe(3);
    expect(before.kpis.utilisation).toBeCloseTo(3 / 36, 5);
    expect(before.kpis.bookings).toBe(2);
    expect(before.kpis.value).toBe(150000 + 90000);
    expect(before.kpis.atVenue).toBe(150000); // only the walk-in that paid in full
    expect(before.sources.map((s) => s.count)).toEqual([0, 1, 1]);
    const wd = new Date(D + "T00:00:00Z").getUTCDay();
    expect(before.heat[wd][18]).toBe(1); // both halves booked
    expect(before.heat[wd][19]).toBe(0.5); // one of two halves
    expect(before.heat[wd][3]).toBeNull(); // closed at 3 AM

    const t = await prisma.turf.findUniqueOrThrow({ where: { id: turfId } });
    await createBlock(owner, t, { configId: null, startAt: istToUtc(D, 12 * 60), endAt: istToUtc(D, 13 * 60), reason: "MAINTENANCE" });
    const after = await turfAnalytics(turfId, { from: D, to: D });
    expect(after.capacity.blockedHours).toBe(2);
    expect(after.kpis.utilisation).toBeCloseTo(3 / 34, 5);
  });
});
