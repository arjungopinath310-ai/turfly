/**
 * Private sample turfs (demo mode) against a real PostgreSQL (npm run test:integration): anyone without a turf gets one
 * copy of the sample turf, full of data and owned by them; copies are hidden from players and search; their customers
 * can't sign in; the top-up keeps them current.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomInt } from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { findOpenGames } from "@/lib/games";
import { manageableTurfs } from "@/lib/owner";
import { searchTurfs } from "@/lib/search";
import { ensureSandbox, topUpShowcase } from "@/lib/showcase";

const newUser = (name: string) => prisma.user.create({ data: { phone: `+917${String(randomInt(0, 1e9)).padStart(9, "0")}`, name } });
let owner: User;

beforeAll(async () => {
  await prisma.city.upsert({ where: { slug: "manjeri" }, update: {}, create: { slug: "manjeri", name: "Manjeri", state: "Kerala", lat: 11.12, lng: 76.12, pincodes: [] } });
  owner = await newUser("Sandbox Tester");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("private sample turfs", () => {
  it("someone with no turf gets one full copy as its owner, in a few seconds", async () => {
    const t0 = Date.now();
    const id = await ensureSandbox(owner);
    expect(Date.now() - t0).toBeLessThan(15_000);
    const turf = await prisma.turf.findUniqueOrThrow({ where: { id: id! } });
    expect(turf).toMatchObject({ ownerId: owner.id, isSandbox: true, isDemo: true, status: "APPROVED", availabilityMode: "LIVE" });
    expect(turf.name).toContain("Sandbox’s Arena");

    const now = new Date();
    expect(await prisma.booking.count({ where: { turfId: turf.id, status: "COMPLETED" } })).toBeGreaterThan(200);
    expect(await prisma.booking.count({ where: { turfId: turf.id, status: "CONFIRMED", startAt: { gt: now } } })).toBeGreaterThan(30);
    expect(await prisma.review.count({ where: { turfId: turf.id } })).toBeGreaterThan(20);
    expect(await prisma.ledgerEntry.count({ where: { turfId: turf.id } })).toBeGreaterThan(100);
    expect(await prisma.notification.count({ where: { userId: owner.id, title: { startsWith: "New booking" } } })).toBe(3);
    expect(await prisma.conversation.count({ where: { turfId: turf.id } })).toBe(3);
    expect((await findOpenGames({ turfId: turf.id })).length).toBeGreaterThanOrEqual(1);

    // its customers are sample players nobody can sign in as
    const customers = await prisma.user.findMany({ where: { bookings: { some: { turfId: turf.id } } }, select: { phone: true, email: true } });
    expect(customers.length).toBeGreaterThan(0);
    expect(customers.every((u) => u.phone === null && u.email?.endsWith("@sample.turfly.invalid"))).toBe(true);

    // the owner side shows it
    expect((await manageableTurfs(owner)).map((t) => t.id)).toEqual([turf.id]);
  });

  it("one copy per person, even when two pages ask at the same time", async () => {
    expect(await ensureSandbox(owner)).toBe((await prisma.turf.findFirstOrThrow({ where: { ownerId: owner.id } })).id);
    const other = await newUser("Racer");
    const [a, b] = await Promise.all([ensureSandbox(other), ensureSandbox(other)]);
    expect(a).toBe(b);
    expect(await prisma.turf.count({ where: { ownerId: other.id } })).toBe(1);
  });

  it("copies are hidden from players: search, the turf list and public games", async () => {
    const turf = await prisma.turf.findFirstOrThrow({ where: { ownerId: owner.id, isSandbox: true } });
    expect((await searchTurfs({ q: turf.name })).total).toBe(0);
    const games = await findOpenGames({});
    expect(games.some((g) => g.turfId === turf.id)).toBe(false);
  });

  it("someone who already owns a turf gets no copy", async () => {
    const realOwner = await newUser("Real Owner");
    const city = await prisma.city.findUniqueOrThrow({ where: { slug: "manjeri" } });
    await prisma.turf.create({ data: { slug: `real-${owner.id.slice(-6)}-${randomInt(1e6)}`, name: "Real Turf", cityId: city.id, ownerId: realOwner.id, addressLine: "x", pincode: "676121", lat: 11, lng: 76, status: "DRAFT" } });
    expect(await ensureSandbox(realOwner)).toBeNull();
    expect(await prisma.turf.count({ where: { ownerId: realOwner.id, isSandbox: true } })).toBe(0);
  });

  it("the top-up keeps copies current and adds nothing when nothing is due", async () => {
    const r = (await topUpShowcase()) as { sandboxes?: { count: number; bookings: number } };
    expect(r.sandboxes?.count).toBeGreaterThanOrEqual(2);
    const again = (await topUpShowcase()) as { sandboxes?: { bookings: number; games: number } };
    expect(again.sandboxes).toMatchObject({ bookings: 0, games: 0 });
  });
});
