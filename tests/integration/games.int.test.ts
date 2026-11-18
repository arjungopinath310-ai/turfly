/**
 * Open games ("short of players") against a real PostgreSQL (npm run test:integration).
 * Covers: listing while booking (hidden until paid), asking to join with a message, the private chat,
 * accepting into the squad, filling up, leaving, the race for the last spot, closing, and cancelling the booking.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomInt } from "node:crypto";
import type { Booking, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cancelBooking, createHold } from "@/lib/engine/booking";
import { convertiblePitchLayout } from "@/lib/engine/allocation";
import { applyGatewayEvent, createPaymentOrder } from "@/lib/payments/service";
import {
  findOpenGames,
  listGameForBooking,
  requestToJoin,
  respondToRequest,
  sendGameMessage,
  threadMessages,
  updateGame,
  withdrawRequest,
} from "@/lib/games";
import { addDays, todayIst } from "@/lib/time";

const D = addDays(todayIst(), 4);
const tag = randomBytes(4).toString("hex");
let turfId = "";
let fiveId = "";
const users: User[] = [];

const capture = (orderId: string, amount: number) =>
  applyGatewayEvent(`evt_${randomBytes(6).toString("hex")}`, "payment.captured", { payment: { entity: { id: `pay_${randomBytes(6).toString("hex")}`, order_id: orderId, amount, status: "captured", method: "upi" } } }, true);

async function pay(organiser: User, b: Booking) {
  const { payment } = await createPaymentOrder(organiser, b.id);
  await capture(payment.providerOrderId, payment.amount);
  return prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
}

const postOf = (bookingId: string) => prisma.playerPost.findFirstOrThrow({ where: { bookingId }, orderBy: { createdAt: "desc" } });

beforeAll(async () => {
  const city = await prisma.city.upsert({ where: { slug: "it-city" }, update: {}, create: { slug: "it-city", name: "IT City", state: "KL", lat: 11, lng: 76, pincodes: [] } });
  const turf = await prisma.turf.create({
    data: { slug: `it-games-${tag}`, name: "IT Games Turf", cityId: city.id, addressLine: "x", pincode: "676121", lat: 11, lng: 76, status: "APPROVED", availabilityMode: "LIVE", minNoticeMinutes: 0, slotStepMinutes: 60 },
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
  for (let i = 0; i < 6; i++)
    users.push(await prisma.user.create({ data: { phone: `+917${String(randomInt(0, 1e9)).padStart(9, "0")}`, name: `Gamer ${i} ${tag}`, preferredPosition: i === 1 ? "Goalkeeper" : null } }));
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("open games", () => {
  it("a game listed while booking stays hidden until the payment confirms the booking", async () => {
    const [org] = users;
    const hold = await createHold(org, { turfId, configId: fiveId, date: D, startMinute: 7 * 60, durationMinutes: 60, openSpots: { playersNeeded: 2, skillLevel: "Casual", note: "Friendly game" } });
    const draft = await postOf(hold.id);
    expect(draft.status).toBe("DRAFT");
    expect(draft.playersPerSide).toBe(5);
    expect(draft.sharePerPlayer).toBe(10000); // ₹1,000 split over 10 players
    expect((await findOpenGames({ turfId })).some((g) => g.id === draft.id)).toBe(false);
    await expect(requestToJoin(users[1], draft.id, "hi")).rejects.toThrow(/not found/i);

    await pay(org, hold);
    const open = await postOf(hold.id);
    expect(open.status).toBe("OPEN");
    const listed = await findOpenGames({ turfId });
    expect(listed.find((g) => g.id === open.id)?.spots).toBe(2);
    expect(await prisma.notification.count({ where: { userId: org.id, link: `/games/${open.id}`, title: "Your game is listed" } })).toBe(1);
  });

  it("too many players for the format is refused and no hold is left behind", async () => {
    const [org] = users;
    const before = await prisma.booking.count({ where: { turfId } });
    await expect(createHold(org, { turfId, configId: fiveId, date: D, startMinute: 9 * 60, durationMinutes: 60, openSpots: { playersNeeded: 10 } })).rejects.toThrow(/1 to 9/);
    expect(await prisma.booking.count({ where: { turfId } })).toBe(before);
  });

  it("ask to join with a message, private chat, accept into the squad, fill up, leave, close", async () => {
    const [org, p1, p2, p3, stranger] = users;
    const b = await prisma.booking.findFirstOrThrow({ where: { turfId, userId: org.id, status: "CONFIRMED" } });
    const game = await postOf(b.id);

    await expect(requestToJoin(org, game.id, "me")).rejects.toThrow(/your own game/);
    const r1 = await requestToJoin(p1, game.id, "Hi, I can play in goal");
    await expect(requestToJoin(p1, game.id, "again")).rejects.toThrow(/already asked/);
    expect(await prisma.notification.count({ where: { userId: org.id, link: `/games/${game.id}?r=${r1.id}` } })).toBe(1);

    // chat: only the organiser and that player
    await sendGameMessage(org, r1.id, "Great, see you at 7");
    const t1 = await threadMessages(p1, r1.id);
    expect(t1.messages.map((m) => [m.body, m.mine])).toEqual([["Hi, I can play in goal", true], ["Great, see you at 7", false]]);
    expect((await threadMessages(org, r1.id)).role).toBe("organiser");
    await expect(threadMessages(stranger, r1.id)).rejects.toThrow(/not found/i);
    await expect(sendGameMessage(stranger, r1.id, "hello")).rejects.toThrow(/not found/i);
    await expect(respondToRequest(p1, r1.id, "ACCEPTED")).rejects.toThrow(/not found/i);

    const r2 = await requestToJoin(p2, game.id, null);
    const r3 = await requestToJoin(p3, game.id, "Can I come?");
    await respondToRequest(org, r1.id, "ACCEPTED");
    await respondToRequest(org, r2.id, "ACCEPTED");
    expect((await prisma.playerPost.findUniqueOrThrow({ where: { id: game.id } })).status).toBe("FILLED");
    expect(await prisma.matchPlayer.count({ where: { bookingId: b.id, userId: { in: [p1.id, p2.id] }, status: "CONFIRMED" } })).toBe(2);
    expect((await findOpenGames({ turfId })).some((g) => g.id === game.id)).toBe(false);
    await expect(respondToRequest(org, r3.id, "ACCEPTED")).rejects.toThrow(/All spots are taken/);
    await expect(updateGame(org, game.id, { playersNeeded: 1 })).rejects.toThrow(/2 players have already joined/);

    // p2 leaves: out of the squad, the game is open again with one spot
    await withdrawRequest(p2, r2.id);
    expect(await prisma.matchPlayer.count({ where: { bookingId: b.id, userId: p2.id } })).toBe(0);
    expect((await findOpenGames({ turfId })).find((g) => g.id === game.id)?.spots).toBe(1);
    expect(await prisma.notification.count({ where: { userId: org.id, title: { contains: "left your game" } } })).toBe(1);

    // closing: people still waiting are declined; players who joined stay in
    await updateGame(org, game.id, { action: "close" });
    expect((await prisma.playerPostRequest.findUniqueOrThrow({ where: { id: r3.id } })).status).toBe("DECLINED");
    expect((await prisma.playerPostRequest.findUniqueOrThrow({ where: { id: r1.id } })).status).toBe("ACCEPTED");
    await expect(requestToJoin(stranger, game.id, "hi")).rejects.toThrow(/isn't taking players/);
    const reopened = await updateGame(org, game.id, { action: "reopen" });
    expect(reopened.status).toBe("OPEN");
  });

  it("two accepts for the last spot: only one gets in", async () => {
    const [, , , p3, p4, org2] = users;
    const hold = await createHold(org2, { turfId, configId: fiveId, date: D, startMinute: 11 * 60, durationMinutes: 60, openSpots: { playersNeeded: 1 } });
    await pay(org2, hold);
    const game = await postOf(hold.id);
    const a = await requestToJoin(p3, game.id, null);
    const b = await requestToJoin(p4, game.id, null);
    const res = await Promise.allSettled([respondToRequest(org2, a.id, "ACCEPTED"), respondToRequest(org2, b.id, "ACCEPTED")]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.playerPostRequest.count({ where: { postId: game.id, status: "ACCEPTED" } })).toBe(1);
  });

  it("listing again from the booking updates the same game; cancelling the booking closes it and tells the players", async () => {
    const [org, p1] = users;
    const b = await prisma.booking.findFirstOrThrow({ where: { turfId, userId: org.id, status: "CONFIRMED", startAt: { gt: new Date() } }, orderBy: { startAt: "asc" } });
    const game = await postOf(b.id);
    const again = await listGameForBooking(org, b.id, { playersNeeded: 3, note: "Need a striker" });
    expect(again.id).toBe(game.id);
    expect(await prisma.playerPost.count({ where: { bookingId: b.id, status: { not: "CLOSED" } } })).toBe(1);
    // the database also refuses a second active listing for one booking
    await expect(prisma.playerPost.create({ data: { userId: org.id, cityId: game.cityId, turfId, bookingId: b.id, playersNeeded: 1, playersPerSide: 5, startAt: b.startAt } })).rejects.toThrow();

    await cancelBooking(org, b.id, "Rain", "customer");
    expect((await prisma.playerPost.findUniqueOrThrow({ where: { id: game.id } })).status).toBe("CLOSED");
    expect(await prisma.notification.count({ where: { userId: p1.id, title: "Game cancelled", link: `/games/${game.id}` } })).toBe(1);
    expect((await findOpenGames({ turfId })).some((g) => g.id === game.id)).toBe(false);
  });
});
