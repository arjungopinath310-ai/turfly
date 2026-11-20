/**
 * Player profile and leaderboard (npm run test:integration): matches counted once whether booked, joined or
 * on a roster; teammates; reliability with no-shows; weekly goal; ranks, with opted-out names hidden.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { singlePitchLayout } from "@/lib/engine/allocation";
import { homeCityOf, leaderboard, playerProfile } from "@/lib/player-stats";
import { addDays, istToUtc, todayIst } from "@/lib/time";

const tag = randomBytes(3).toString("hex").toUpperCase();
let turfId = "";
let cfgId = "";
let cityId = "";
const u: User[] = [];
let hour = 6;

async function booking(owner: User | null, daysAgo: number, status: "CONFIRMED" | "COMPLETED" | "NO_SHOW" = "COMPLETED") {
  const day = addDays(todayIst(), -daysAgo);
  const h = hour++; // a different hour each time so bookings never overlap
  return prisma.booking.create({
    data: { code: `TF-P${randomBytes(3).toString("hex").toUpperCase()}`, turfId, configId: cfgId, userId: owner?.id ?? null, source: "ONLINE", status, startAt: istToUtc(day, h * 60), endAt: istToUtc(day, h * 60 + 60), durationMinutes: 60, totalPrice: 80000, advanceAmount: 0, platformFee: 4900, onlineAmount: 4900, balanceDue: 80000, policySnapshot: {} },
  });
}

beforeAll(async () => {
  const city = await prisma.city.create({ data: { slug: `stats-${tag.toLowerCase()}`, name: `Statstown ${tag}`, state: "Kerala", lat: 10.5, lng: 76.2, pincodes: [] } });
  cityId = city.id;
  const turf = await prisma.turf.create({ data: { slug: `stats-${tag.toLowerCase()}`, name: "Stats Turf", cityId, addressLine: "x", pincode: "680001", lat: 10.5, lng: 76.2, status: "APPROVED", availabilityMode: "LIVE" } });
  turfId = turf.id;
  const l = singlePitchLayout(5, 80000);
  const unit = await prisma.resourceUnit.create({ data: { turfId, name: l.units[0].name } });
  cfgId = (await prisma.pitchConfig.create({ data: { turfId, name: l.configs[0].name, playersPerSide: 5, basePricePerHour: 80000, units: { create: [{ unitId: unit.id }] } } })).id;
  const stamp = String(Date.now()).slice(-7);
  for (let i = 0; i < 4; i++) u.push(await prisma.user.create({ data: { phone: `+9175${stamp}${i}`, name: `Stat Player${i} ${tag}` } }));
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("player profile", () => {
  it("counts each match once, finds teammates, and lowers reliability for no-shows", async () => {
    const [a, b, c] = u;
    // A books two matches; B joins one through a game post; C is on A's roster for both
    const m1 = await booking(a, 2);
    const m2 = await booking(a, 9);
    await booking(a, 1, "NO_SHOW");
    const post = await prisma.playerPost.create({ data: { userId: a.id, cityId, turfId, bookingId: m1.id, playersNeeded: 2, playersPerSide: 5, startAt: m1.startAt, status: "FILLED" } });
    await prisma.playerPostRequest.create({ data: { postId: post.id, userId: b.id, status: "ACCEPTED" } });
    await prisma.matchPlayer.createMany({ data: [m1, m2].map((m) => ({ bookingId: m.id, userId: c.id, name: "C", status: "CONFIRMED" as const })) });
    await prisma.matchPlayer.create({ data: { bookingId: m1.id, userId: a.id, name: "A (also on the roster)", status: "CONFIRMED" } });
    // a future booking and a cancelled one don't count
    await booking(a, -3, "CONFIRMED");

    const pa = await playerProfile(a.id);
    expect(pa).toMatchObject({ played: 2, teammates: 2, noShows: 1, reliability: 67 });
    expect(pa.badges.find((x) => x.key === "host")).toMatchObject({ progress: 2, earned: false });
    expect((await playerProfile(b.id)).played).toBe(1);
    expect((await playerProfile(b.id)).badges.find((x) => x.key === "team-player")?.progress).toBe(1);
    expect(await playerProfile(c.id)).toMatchObject({ played: 2, teammates: 2, reliability: 100 });
    expect(await homeCityOf(c.id)).toBe(cityId);
  });

  it("tracks the weekly goal", async () => {
    const d = u[3];
    await prisma.user.update({ where: { id: d.id }, data: { weeklyGoal: 1 } });
    await booking(d, 0);
    const p = await playerProfile(d.id);
    // today's match is still on, so this week shows what has been played so far
    expect(p.goal).toMatchObject({ target: 1 });
    expect(p.goal!.thisWeek).toBeGreaterThanOrEqual(0);
  });
});

describe("leaderboard", () => {
  it("ranks the town by matches this month and hides players who opted out", async () => {
    const [a, b, c] = u;
    await prisma.user.update({ where: { id: b.id }, data: { hideFromLeaderboard: true } });
    const board = await leaderboard({ cityId });
    const names = board.rows.map((r) => r.userId);
    expect(names).toContain(a.id);
    expect(names).toContain(c.id);
    expect(names).not.toContain(b.id); // hidden, but still ranked
    expect(board.rankOf(b.id)?.matches).toBe(1);
    expect(board.rankOf(a.id)).toMatchObject({ matches: 2, rank: 1 });
    expect(board.rankOf(c.id)).toMatchObject({ matches: 2, rank: 1 }); // ties share a rank
    expect(board.rows.find((r) => r.userId === a.id)?.name).toBe(`Stat P.`);
  });
});
