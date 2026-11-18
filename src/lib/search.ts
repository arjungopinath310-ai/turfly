import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getAvailability } from "./engine/booking";
import { isValidDate } from "./time";

export interface TurfFilters {
  q?: string;
  city?: string;
  pincode?: string;
  format?: string; // "5" | "7"
  maxPrice?: string; // rupees / hour
  amenities?: string; // comma list
  minRating?: string;
  lat?: string;
  lng?: string;
  radius?: string; // km
  date?: string;
  time?: string; // "HH:MM"
  sort?: string; // distance | price | rating
  bookable?: string; // "1" = only turfs that take bookings on Turfly
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Latitude/longitude box around a point (cheap, index-friendly pre-filter before the exact distance check). */
export function boundingBox(lat: number, lng: number, km: number) {
  const dLat = km / 111.32;
  const dLng = km / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

/** Runs async work over a list with at most `limit` running at once (keeps DB connections in check). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export const PAGE_SIZE = 24;
const AVAILABILITY_CONCURRENCY = 6;

/**
 * Turf search, built to stay fast as the number of turfs grows:
 *  1. Filters run in the database; a light first query returns only what sorting needs (no photos, amenities…).
 *  2. Distance, price and "free at" filters and the sort run on that small set; "near me" uses a bounding box first.
 *  3. Full card data is loaded only for the page being shown.
 * Returns the page's cards, every match as a light map point, and the total.
 */
export async function searchTurfs(f: TurfFilters, opts: { page?: number; pageSize?: number } = {}) {
  const pageSize = Math.min(Math.max(opts.pageSize ?? PAGE_SIZE, 1), 100);
  // Private sample copies (demo mode) belong to one person and never show in search
  const where: Prisma.TurfWhereInput = { status: { in: ["APPROVED", "UNCLAIMED"] }, isSandbox: false };
  const and: Prisma.TurfWhereInput[] = [];
  // The search box matches turf names only (towns, PIN codes and facilities are separate filters).
  if (f.q?.trim()) and.push({ name: { contains: f.q.trim(), mode: "insensitive" } });
  if (f.city) and.push({ city: { slug: f.city } });
  if (f.pincode) and.push({ pincode: f.pincode });
  if (f.amenities) and.push({ amenities: { hasEvery: f.amenities.split(",").filter(Boolean) } });
  if (f.minRating) and.push({ ratingAvg: { gte: Number(f.minRating) } });
  if (f.format) and.push({ configs: { some: { isActive: true, playersPerSide: Number(f.format) } } });
  if (f.bookable === "1") and.push({ status: "APPROVED", availabilityMode: "LIVE" });

  const origin = f.lat && f.lng && Number.isFinite(Number(f.lat)) && Number.isFinite(Number(f.lng)) ? { lat: Number(f.lat), lng: Number(f.lng) } : null;
  const radius = origin && f.radius ? Number(f.radius) : null;
  if (origin && radius) {
    const b = boundingBox(origin.lat, origin.lng, radius);
    and.push({ lat: { gte: b.minLat, lte: b.maxLat }, lng: { gte: b.minLng, lte: b.maxLng } });
  }
  if (and.length) where.AND = and;

  // 1. Light candidate set
  const candidates = await prisma.turf.findMany({
    where,
    select: {
      id: true,
      slug: true,
      name: true,
      locality: true,
      lat: true,
      lng: true,
      isFeatured: true,
      availabilityMode: true,
      ratingAvg: true,
      ratingCount: true,
      reportedPriceFrom: true,
      city: { select: { name: true } },
      configs: { where: { isActive: true }, select: { playersPerSide: true, basePricePerHour: true } },
    },
  });

  let rows = candidates.map((t) => {
    const relevant = f.format ? t.configs.filter((c) => c.playersPerSide === Number(f.format)) : t.configs;
    const prices = relevant.map((c) => c.basePricePerHour);
    return {
      ...t,
      locality: t.locality ?? t.city.name,
      minPrice: prices.length ? Math.min(...prices) : null,
      reportedPriceFrom: prices.length ? null : t.reportedPriceFrom, // only for turfs without their own prices
      distanceKm: origin ? haversineKm(origin, t) : null,
    };
  });

  // 2. Filters that need computed values
  if (f.maxPrice) rows = rows.filter((r) => r.minPrice != null && r.minPrice <= Number(f.maxPrice) * 100);
  if (origin && radius) rows = rows.filter((r) => r.distanceKm! <= radius);

  // "Free at" filter: only LIVE turfs have trustworthy data; others are excluded rather than guessed.
  if (f.date && isValidDate(f.date) && f.time && /^\d{2}:\d{2}$/.test(f.time)) {
    const [h, m] = f.time.split(":").map(Number);
    const minute = h * 60 + m;
    const live = rows.filter((r) => r.availabilityMode === "LIVE");
    const open = await mapLimit(live, AVAILABILITY_CONCURRENCY, async (r) => {
      const a = await getAvailability(r.id, f.date!, 60);
      return a.configs.some((c) => (!f.format || c.playersPerSide === Number(f.format)) && c.slots.some((s) => s.startMinute === minute && s.status === "available"));
    });
    const ok = new Set(live.filter((_, i) => open[i]).map((r) => r.id));
    rows = rows.filter((r) => ok.has(r.id));
  }

  const sort = f.sort ?? (origin ? "distance" : "best");
  const isLive = (r: (typeof rows)[number]) => Number(r.availabilityMode === "LIVE");
  rows.sort((a, b) =>
    sort === "distance" && origin
      ? a.distanceKm! - b.distanceKm!
      : sort === "price"
        ? (a.minPrice ?? a.reportedPriceFrom ?? 1e12) - (b.minPrice ?? b.reportedPriceFrom ?? 1e12)
        : sort === "rating"
          ? b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount
          : // Best match: featured, then turfs you can book here, then the best rated.
            Number(b.isFeatured) - Number(a.isFeatured) || isLive(b) - isLive(a) || b.ratingAvg - a.ratingAvg || a.name.localeCompare(b.name),
  );

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(opts.page ?? 1, 1), pageCount);
  const slice = rows.slice((page - 1) * pageSize, page * pageSize);

  // 3. Full data for the visible page only
  const full = await prisma.turf.findMany({
    where: { id: { in: slice.map((r) => r.id) } },
    select: { id: true, status: true, isDemo: true, photos: true, amenities: true, availabilityUpdatedAt: true },
  });
  const byId = new Map(full.map((t) => [t.id, t]));
  const cards = slice.map((r) => {
    const t = byId.get(r.id)!;
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      photo: t.photos[0] ?? null,
      locality: r.locality,
      city: r.city.name,
      lat: r.lat,
      lng: r.lng,
      status: t.status,
      isDemo: t.isDemo,
      isFeatured: r.isFeatured,
      availabilityMode: r.availabilityMode,
      availabilityUpdatedAt: t.availabilityUpdatedAt,
      amenities: t.amenities,
      formats: Array.from(new Set(r.configs.map((c) => c.playersPerSide))).sort(),
      minPrice: r.minPrice,
      reportedPriceFrom: r.reportedPriceFrom,
      ratingAvg: r.ratingAvg,
      ratingCount: r.ratingCount,
      distanceKm: r.distanceKm,
    };
  });
  const points = rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, locality: r.locality, lat: r.lat, lng: r.lng, availabilityMode: r.availabilityMode, minPrice: r.minPrice }));
  return { cards, points, total, page, pageCount, pageSize };
}

export type SearchResult = Awaited<ReturnType<typeof searchTurfs>>;
export type TurfCard = SearchResult["cards"][number];
export type MapPoint = SearchResult["points"][number];
