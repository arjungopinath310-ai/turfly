/**
 * Turfs anywhere in India (npm run test:integration): listings found on the public map are added once,
 * as unclaimed turfs in a town created on the fly, and each ~10 km square is looked up only once.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { cellOf, discoverAround, type OsmElement } from "@/lib/discover";
import { searchTurfs } from "@/lib/search";
import { scheduleBookingJobs } from "@/lib/notifications/service";
import { singlePitchLayout } from "@/lib/engine/allocation";
import { addDays, istToUtc, todayIst } from "@/lib/time";

const tag = randomBytes(3).toString("hex").toUpperCase(); // names are title-cased on import
// a random square in central/eastern India, so earlier runs never left anything here
const base = { lat: +(19 + Math.random() * 4).toFixed(3), lng: +(80 + Math.random() * 5).toFixed(3) };
const at = (dLat: number, dLng: number) => ({ lat: +(base.lat + dLat).toFixed(5), lon: +(base.lng + dLng).toFixed(5) });
const id = () => Math.floor(Math.random() * 1e9);

const elements: OsmElement[] = [
  { type: "way", id: id(), center: at(0, 0), tags: { name: `Alpha Turf ${tag}`, leisure: "pitch", sport: "soccer", phone: "9847012345" } },
  { type: "node", id: id(), ...at(0.0002, 0.0002), tags: { name: `Alpha Turf ${tag}`, leisure: "pitch", sport: "soccer" } }, // same turf, mapped twice
  { type: "way", id: id(), center: at(0.02, 0.02), tags: { name: `Beta Arena ${tag}`, leisure: "pitch", sport: "soccer", surface: "artificial_turf" } },
  { type: "way", id: id(), center: at(0.03, -0.01), tags: { name: `Govt High School Ground ${tag}`, leisure: "pitch", sport: "soccer" } },
  { type: "area", id: 1, tags: { admin_level: "4", name: "Odisha" } },
  { type: "area", id: 2, tags: { admin_level: "8", name: `Testpur ${tag}` } },
];

afterAll(async () => {
  await prisma.$disconnect();
});

describe("turfs found on the public map", () => {
  it("adds new turfs once, in their town, as unclaimed listings players can find", async () => {
    const fetcher = vi.fn(async () => elements);
    const r = await discoverAround(base.lat, base.lng, { fetcher, force: true });
    expect(r).toMatchObject({ status: "done", found: 3, added: 2 });
    // only the centre of the square was sent
    const c = cellOf(base.lat, base.lng);
    expect(fetcher).toHaveBeenCalledWith(c.lat, c.lng);

    const city = await prisma.city.findFirstOrThrow({ where: { name: `Testpur ${tag}` } });
    expect(city.state).toBe("Odisha");
    const listed = await prisma.turf.findMany({ where: { cityId: city.id }, orderBy: { name: "asc" } });
    expect(listed.map((t) => t.name)).toEqual([`Alpha Turf ${tag}`, `Beta Arena ${tag}`]);
    expect(listed.every((t) => t.status === "UNCLAIMED" && t.availabilityMode === "NONE" && t.source === "osm" && t.ownerId === null)).toBe(true);
    expect(listed[0].phone).toBe("+919847012345");

    const near = await searchTurfs({ lat: String(base.lat), lng: String(base.lng), sort: "distance", radius: "10" }, { pageSize: 50 });
    expect(near.cards.filter((x) => x.name.endsWith(tag)).map((x) => x.name)).toEqual([`Alpha Turf ${tag}`, `Beta Arena ${tag}`]);
  });

  it("doesn't ask the map again for the same square, and never lists a turf twice", async () => {
    const fetcher = vi.fn(async () => elements);
    expect(await discoverAround(base.lat + 0.001, base.lng + 0.001, { fetcher })).toMatchObject({ status: "cached" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await discoverAround(base.lat, base.lng, { fetcher, force: true })).toMatchObject({ status: "done", added: 0 });
  });

  it("is for India only", async () => {
    const fetcher = vi.fn(async () => elements);
    expect(await discoverAround(51.5, -0.12, { fetcher })).toMatchObject({ status: "outside" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("WhatsApp alerts for turf owners", () => {
  it("queues one alert to the turf for each online booking, none for walk-ins", async () => {
    const owner = await prisma.user.create({ data: { phone: `+9174${String(Date.now()).slice(-8)}`, name: "Alert owner", role: "OWNER" } });
    const city = await prisma.city.findFirstOrThrow({ where: { name: `Testpur ${tag}` } });
    const turf = await prisma.turf.create({ data: { slug: `alert-${tag}`, name: "Alert Turf", cityId: city.id, ownerId: owner.id, addressLine: "x", pincode: "751001", lat: base.lat, lng: base.lng, status: "APPROVED", availabilityMode: "LIVE", whatsapp: "+919847000000" } });
    const l = singlePitchLayout(5, 80000);
    const unit = await prisma.resourceUnit.create({ data: { turfId: turf.id, name: l.units[0].name } });
    const cfg = await prisma.pitchConfig.create({ data: { turfId: turf.id, name: l.configs[0].name, playersPerSide: 5, basePricePerHour: 80000, units: { create: [{ unitId: unit.id }] } } });
    const day = addDays(todayIst(), 3);
    const mk = (source: "ONLINE" | "WALK_IN", h: number) =>
      prisma.booking.create({
        data: { code: `TF-A${randomBytes(3).toString("hex").toUpperCase()}`, turfId: turf.id, configId: cfg.id, source, status: "CONFIRMED", startAt: istToUtc(day, h * 60), endAt: istToUtc(day, h * 60 + 60), durationMinutes: 60, totalPrice: 80000, advanceAmount: 0, platformFee: source === "ONLINE" ? 4900 : 0, onlineAmount: source === "ONLINE" ? 4900 : 0, balanceDue: 80000, policySnapshot: {}, customerName: "Player" },
      });
    const online = await mk("ONLINE", 18);
    const walkIn = await mk("WALK_IN", 19);
    await scheduleBookingJobs(prisma, online.id);
    await scheduleBookingJobs(prisma, online.id); // e.g. a reschedule: still one alert
    await scheduleBookingJobs(prisma, walkIn.id);
    const alerts = await prisma.notificationJob.findMany({ where: { template: "OWNER_NEW_BOOKING", booking: { turfId: turf.id } } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ bookingId: online.id, userId: owner.id, channel: "WHATSAPP" });
  });
});
