/**
 * The sales specimen keeps itself current (npm run test:integration): the top-up fills days with no sample activity,
 * keeps open games available, and does nothing when nothing is due.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { convertiblePitchLayout } from "@/lib/engine/allocation";
import { findOpenGames } from "@/lib/games";
import { SHOWCASE_SLUG, ensureSamplePlayers, topUpShowcase } from "@/lib/showcase";
import { addDays, istToUtc, todayIst } from "@/lib/time";

let turfId = "";

async function deleteBookings(where: { turfId: string; startAt: { gte: Date } }) {
  const B = (await prisma.booking.findMany({ where, select: { id: true } })).map((b) => b.id);
  const P = (await prisma.payment.findMany({ where: { bookingId: { in: B } }, select: { id: true } })).map((p) => p.id);
  await prisma.$transaction([
    prisma.refund.deleteMany({ where: { paymentId: { in: P } } }),
    prisma.ledgerEntry.deleteMany({ where: { bookingId: { in: B } } }),
    prisma.payment.deleteMany({ where: { id: { in: P } } }),
    prisma.review.deleteMany({ where: { bookingId: { in: B } } }),
    prisma.playerPost.deleteMany({ where: { bookingId: { in: B } } }),
    prisma.booking.deleteMany({ where: { id: { in: B } } }),
  ]);
  return B.length;
}

beforeAll(async () => {
  // The test database may already hold a sample turf (from seed-showcase); otherwise make a bare one.
  const existing = await prisma.turf.findUnique({ where: { slug: SHOWCASE_SLUG } });
  if (existing) {
    turfId = existing.id;
    // Games that earlier runs filled keep their bookings from taking a new game: clear them, so repeated runs
    // in the same week still have bookings to list games on
    await prisma.playerPost.deleteMany({ where: { turfId, status: "FILLED" } });
    return;
  }
  const city = await prisma.city.upsert({ where: { slug: "manjeri" }, update: {}, create: { slug: "manjeri", name: "Manjeri", state: "Kerala", lat: 11.12, lng: 76.12, pincodes: [] } });
  const owner = await prisma.user.upsert({ where: { phone: "+919000000001" }, update: { role: "OWNER" }, create: { phone: "+919000000001", name: "Demo Owner", role: "OWNER" } });
  await ensureSamplePlayers();
  const turf = await prisma.turf.create({
    data: { slug: SHOWCASE_SLUG, name: "Sample", cityId: city.id, ownerId: owner.id, addressLine: "x", pincode: "676121", lat: 11.12, lng: 76.12, status: "APPROVED", availabilityMode: "LIVE", isDemo: true, slotStepMinutes: 60 },
  });
  turfId = turf.id;
  await prisma.operatingHours.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ turfId, weekday, openMinute: 360, closeMinute: 1500 })) });
  const l = convertiblePitchLayout({ halvesSimultaneous: true, allowCombined: true, fullPricePerHour: 150000, halfPricePerHour: 90000 });
  const ids: Record<string, string> = {};
  for (const [i, u] of l.units.entries()) ids[u.key] = (await prisma.resourceUnit.create({ data: { turfId, name: u.name, isVirtual: Boolean(u.isVirtual), sortOrder: i } })).id;
  for (const [i, c] of l.configs.entries())
    await prisma.pitchConfig.create({ data: { turfId, name: c.name, playersPerSide: c.playersPerSide, basePricePerHour: c.basePricePerHour, sortOrder: i, units: { create: c.unitKeys.map((k) => ({ unitId: ids[k] })) } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("sample turf top-up", () => {
  it("fills the days ahead, keeps open games, and is a no-op when run again", async () => {
    // Pretend the PC was off: the last two days of sample activity are missing
    const today = todayIst();
    await deleteBookings({ turfId, startAt: { gte: istToUtc(addDays(today, 9), 0) } });
    const first = await topUpShowcase();
    expect(first).toMatchObject({ games: expect.any(Number) });
    const last = await prisma.booking.findFirst({ where: { turfId, userId: { not: null } }, orderBy: { startAt: "desc" } });
    expect(todayIst(last!.startAt) >= addDays(today, 9)).toBe(true);
    const games = await findOpenGames({ turfId });
    expect(games.length).toBeGreaterThanOrEqual(4);
    expect(games.every((g) => g.spots > 0 && g.startAt > new Date())).toBe(true);

    const again = await topUpShowcase();
    expect(again).toMatchObject({ days: 0, bookings: 0, games: 0 });
  });

  it("lists another game when one fills up", async () => {
    // leave exactly three open games, whatever earlier runs left behind. Only games more than 3 hours away count
    // (the top-up ignores ones about to start), so the test passes at any time of day. The others are removed,
    // not marked filled, so their bookings can take a game again and repeated runs don't use up the week.
    const soon = Date.now() + 3 * 3_600_000;
    const later = (await findOpenGames({ turfId })).filter((g) => g.startAt.getTime() > soon);
    await prisma.playerPost.deleteMany({ where: { id: { in: later.slice(3).map((g) => g.id) } } });
    const r = await topUpShowcase();
    expect(r).toMatchObject({ games: 1 });
    expect((await findOpenGames({ turfId })).length).toBeGreaterThanOrEqual(4);
  });

  it("never touches bookings of real users on the sample turf", async () => {
    const real = await prisma.user.create({ data: { phone: `+917${String(Date.now()).slice(-9)}`, name: `Real ${randomBytes(2).toString("hex")}` } });
    const cfg = await prisma.pitchConfig.findFirstOrThrow({ where: { turfId } });
    const day = addDays(todayIst(), 2);
    const b = await prisma.booking.create({
      data: { code: `TF-T${randomBytes(3).toString("hex").toUpperCase()}`, turfId, configId: cfg.id, userId: real.id, source: "ONLINE", status: "CONFIRMED", startAt: istToUtc(day, 23 * 60), endAt: istToUtc(day, 24 * 60), durationMinutes: 60, totalPrice: 100000, advanceAmount: 0, platformFee: 0, onlineAmount: 0, balanceDue: 100000, policySnapshot: {} },
    });
    await topUpShowcase();
    expect(await prisma.booking.findUnique({ where: { id: b.id } })).not.toBeNull();
    expect(await prisma.playerPost.count({ where: { bookingId: b.id } })).toBe(0);
  });
});
