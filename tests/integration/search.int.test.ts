/**
 * Integration tests (real PostgreSQL): turf search scales past one page — no silent cap, pages don't overlap,
 * the map gets every match, and "near me" with a radius only returns turfs inside it.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { haversineKm, searchTurfs } from "@/lib/search";

const tag = randomBytes(3).toString("hex");
const CITY = `it-search-${tag}`;
const N = 130; // more than the old 100-turf cap

beforeAll(async () => {
  const city = await prisma.city.create({ data: { slug: CITY, name: "IT Search", state: "KL", lat: 11.1, lng: 76.1, pincodes: [] } });
  await prisma.turf.createMany({
    data: Array.from({ length: N }, (_, i) => ({
      slug: `its-${tag}-${i}`,
      name: `IT Search Turf ${String(i).padStart(3, "0")}`,
      cityId: city.id,
      addressLine: "x",
      pincode: "676121",
      // spread over ~30 km
      lat: 11.1 + ((i % 13) - 6) * 0.02,
      lng: 76.1 + (Math.floor(i / 13) - 5) * 0.02,
      status: i % 10 === 0 ? "DRAFT" : "UNCLAIMED", // drafts must never show
      availabilityMode: "NONE",
    })),
  });
});

describe("turf search at scale", () => {
  it("finds every visible turf (no cap), pages don't overlap, the map gets all of them", async () => {
    const visible = N - Math.ceil(N / 10);
    const first = await searchTurfs({ city: CITY }, { pageSize: 50 });
    expect(first.total).toBe(visible);
    expect(first.points).toHaveLength(visible);
    expect(first.pageCount).toBe(Math.ceil(visible / 50));
    const seen = new Set<string>();
    for (let page = 1; page <= first.pageCount; page++) {
      const r = await searchTurfs({ city: CITY }, { page, pageSize: 50 });
      for (const c of r.cards) {
        expect(seen.has(c.id)).toBe(false);
        seen.add(c.id);
      }
    }
    expect(seen.size).toBe(visible);
  });

  it("an out-of-range page shows the last page instead of nothing", async () => {
    const r = await searchTurfs({ city: CITY }, { page: 999, pageSize: 50 });
    expect(r.page).toBe(r.pageCount);
    expect(r.cards.length).toBeGreaterThan(0);
  });

  it("near me with a radius: only turfs within it, nearest first", async () => {
    const origin = { lat: 11.1, lng: 76.1 };
    const r = await searchTurfs({ city: CITY, lat: String(origin.lat), lng: String(origin.lng), radius: "5" }, { pageSize: 100 });
    expect(r.total).toBeGreaterThan(0);
    const d = r.cards.map((c) => c.distanceKm!);
    expect(d.every((x) => x <= 5)).toBe(true);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
    const all = await prisma.turf.findMany({ where: { city: { slug: CITY }, status: "UNCLAIMED" }, select: { lat: true, lng: true } });
    expect(r.total).toBe(all.filter((t) => haversineKm(origin, t) <= 5).length);
  });

  it("name search matches names only", async () => {
    const r = await searchTurfs({ city: CITY, q: "turf 007" });
    expect(r.cards.map((c) => c.name)).toEqual(["IT Search Turf 007"]);
  });
});
