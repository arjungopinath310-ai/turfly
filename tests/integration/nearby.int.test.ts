/**
 * "Turfs near you" (npm run test:integration): nearest first from the phone's position, and each LIVE turf's
 * first free slot today, which follows blocks the owner taps on the calendar chart.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { createBlock, getAvailability } from "@/lib/engine/booking";
import { singlePitchLayout } from "@/lib/engine/allocation";
import { freeToday, searchTurfs } from "@/lib/search";
import { istToUtc, todayIst } from "@/lib/time";

const tag = randomBytes(3).toString("hex");
const turfs: { id: string; availabilityMode: string }[] = [];
// A spot far from the other test turfs, so "nearest" is only ours
const HOME = { lat: 12.9, lng: 77.6 };

async function makeTurf(name: string, dLat: number, live: boolean) {
  const city = await prisma.city.upsert({ where: { slug: "it-near" }, update: {}, create: { slug: "it-near", name: "IT Near", state: "KA", lat: HOME.lat, lng: HOME.lng, pincodes: [] } });
  const t = await prisma.turf.create({
    data: { slug: `near-${tag}-${name}`, name: `Near ${name} ${tag}`, cityId: city.id, addressLine: "x", pincode: "560001", lat: HOME.lat + dLat, lng: HOME.lng, status: "APPROVED", availabilityMode: live ? "LIVE" : "NONE", minNoticeMinutes: 0, slotStepMinutes: 60 },
  });
  // open round the clock (0:00 to 6:00 next morning), so there's a free hour whatever time the test runs
  await prisma.operatingHours.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ turfId: t.id, weekday, openMinute: 0, closeMinute: 1800 })) });
  const l = singlePitchLayout(5, 80000);
  const ids: Record<string, string> = {};
  for (const u of l.units) ids[u.key] = (await prisma.resourceUnit.create({ data: { turfId: t.id, name: u.name } })).id;
  for (const c of l.configs) await prisma.pitchConfig.create({ data: { turfId: t.id, name: c.name, playersPerSide: c.playersPerSide, basePricePerHour: c.basePricePerHour, units: { create: c.unitKeys.map((k) => ({ unitId: ids[k] })) } } });
  turfs.push({ id: t.id, availabilityMode: t.availabilityMode });
  return t;
}

// Earlier runs' turfs at the same spot would push ours off the first page: take them out of search
const retireOld = () => prisma.turf.updateMany({ where: { slug: { startsWith: "near-" }, NOT: { slug: { startsWith: `near-${tag}-` } }, status: "APPROVED" }, data: { status: "SUSPENDED" } });

beforeAll(async () => {
  await retireOld();
  await makeTurf("far", 0.2, true); // ~22 km
  await makeTurf("close", 0.01, true); // ~1 km
  await makeTurf("listed", 0.05, false); // ~5.5 km, no live slots
});

afterAll(async () => {
  await prisma.turf.updateMany({ where: { id: { in: turfs.map((t) => t.id) } }, data: { status: "SUSPENDED" } });
  await prisma.$disconnect();
});

describe("turfs near you", () => {
  it("lists the closest turfs first, with the distance", async () => {
    const r = await searchTurfs({ lat: String(HOME.lat), lng: String(HOME.lng), sort: "distance", radius: "30" }, { pageSize: 50 });
    const ours = r.cards.filter((c) => c.name.endsWith(tag));
    expect(ours.map((c) => c.name.split(" ")[1])).toEqual(["close", "listed", "far"]);
    expect(ours[0].distanceKm!).toBeLessThan(2);
    expect(ours[2].distanceKm!).toBeGreaterThan(20);
  });

  it("puts the demo turf first wherever the player is (for sales), without a distance", async () => {
    const demo = await prisma.turf.findFirst({ where: { isDemo: true, isSandbox: false, status: "APPROVED" }, orderBy: { createdAt: "asc" } });
    if (!demo) return; // the test database has no sample turf yet (seed-showcase / showcase test makes one)
    const r = await searchTurfs({ lat: String(HOME.lat), lng: String(HOME.lng), sort: "distance", radius: "30" }, { pageSize: 50, pinDemo: true });
    expect(r.cards[0]).toMatchObject({ id: demo.id, distanceKm: null });
    expect(r.cards.filter((c) => c.id === demo.id)).toHaveLength(1);
    expect(r.cards.filter((c) => c.name.endsWith(tag)).map((c) => c.name.split(" ")[1])).toEqual(["close", "listed", "far"]);
    // even when searching for a name, the demo stays first
    const named = await searchTurfs({ q: `Near close ${tag}` }, { pinDemo: true });
    expect(named.cards.map((c) => c.id)).toEqual([demo.id, ...named.cards.slice(1).map((c) => c.id)]);
    expect(named.cards[1]?.name).toBe(`Near close ${tag}`);
    // without the option, nothing changes
    const plain = await searchTurfs({ lat: String(HOME.lat), lng: String(HOME.lng), sort: "distance", radius: "30" }, { pageSize: 50 });
    expect(plain.cards.some((c) => c.id === demo.id)).toBe(false);
  });

  it("shows the first free hour today for bookable turfs, and follows blocks", async () => {
    const free = await freeToday(turfs);
    const [far, close, listed] = turfs;
    expect(listed.id in free).toBe(false); // no live availability: nothing to show
    const a = await getAvailability(close.id, todayIst(), 60);
    const first = Math.min(...a.configs.flatMap((c) => c.slots.filter((s) => s.status === "available").map((s) => s.startMinute)));
    expect(free[close.id]).toBe(first);
    expect(free[far.id]).toBe(first);

    // the owner blocks that hour on the chart: the card now shows the next free one
    const owner = await prisma.user.create({ data: { phone: `+9173${String(Date.now()).slice(-8)}`, name: "Near owner" } });
    const turf = await prisma.turf.findUniqueOrThrow({ where: { id: close.id } });
    await createBlock(owner, turf, { configId: null, startAt: istToUtc(todayIst(), first), endAt: istToUtc(todayIst(), first + 60), reason: "MAINTENANCE" });
    const after = await freeToday([close]);
    expect(after[close.id]).toBe(first + 60);
  });
});
