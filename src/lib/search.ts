import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getAvailability } from "./engine/booking";
import { isValidDate } from "./time";
import { decodeDigipin } from "./digipin";

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

export async function searchTurfs(input: TurfFilters) {
  // A DIGIPIN typed into the search box means "turfs near this spot": nearest first, no text filter.
  const near = input.q ? decodeDigipin(input.q) : null;
  const f: TurfFilters = near ? { ...input, q: undefined, lat: String(near.lat), lng: String(near.lng), sort: input.sort ?? "distance" } : input;
  const where: Prisma.TurfWhereInput = { status: { in: ["APPROVED", "UNCLAIMED"] } };
  const and: Prisma.TurfWhereInput[] = [];
  if (f.q) and.push({ OR: [{ name: { contains: f.q, mode: "insensitive" } }, { locality: { contains: f.q, mode: "insensitive" } }, { addressLine: { contains: f.q, mode: "insensitive" } }, { pincode: f.q }] });
  if (f.city) and.push({ city: { slug: f.city } });
  if (f.pincode) and.push({ pincode: f.pincode });
  if (f.amenities) and.push({ amenities: { hasEvery: f.amenities.split(",").filter(Boolean) } });
  if (f.minRating) and.push({ ratingAvg: { gte: Number(f.minRating) } });
  if (f.format) and.push({ configs: { some: { isActive: true, playersPerSide: Number(f.format) } } });
  if (f.bookable === "1") and.push({ status: "APPROVED", availabilityMode: "LIVE" });
  if (and.length) where.AND = and;

  const turfs = await prisma.turf.findMany({
    where,
    include: { city: true, configs: { where: { isActive: true }, select: { id: true, name: true, playersPerSide: true, basePricePerHour: true } } },
    orderBy: [{ isFeatured: "desc" }, { ratingAvg: "desc" }],
    take: 100,
  });

  const origin = f.lat && f.lng ? { lat: Number(f.lat), lng: Number(f.lng) } : null;
  let rows = turfs.map((t) => {
    const relevant = f.format ? t.configs.filter((c) => c.playersPerSide === Number(f.format)) : t.configs;
    const prices = relevant.map((c) => c.basePricePerHour);
    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      photo: t.photos[0] ?? null,
      locality: t.locality ?? t.city.name,
      city: t.city.name,
      lat: t.lat,
      lng: t.lng,
      status: t.status,
      isDemo: t.isDemo,
      isFeatured: t.isFeatured,
      availabilityMode: t.availabilityMode,
      availabilityUpdatedAt: t.availabilityUpdatedAt,
      amenities: t.amenities,
      formats: Array.from(new Set(t.configs.map((c) => c.playersPerSide))).sort(),
      minPrice: prices.length ? Math.min(...prices) : null,
      reportedPriceFrom: prices.length ? null : t.reportedPriceFrom, // only for turfs without their own prices
      ratingAvg: t.ratingAvg,
      ratingCount: t.ratingCount,
      distanceKm: origin ? haversineKm(origin, t) : null,
      openSlot: null as null | boolean,
    };
  });

  if (f.maxPrice) rows = rows.filter((r) => r.minPrice != null && r.minPrice <= Number(f.maxPrice) * 100);
  if (origin && f.radius) rows = rows.filter((r) => r.distanceKm! <= Number(f.radius));

  // "Available at" filter: only LIVE turfs have trustworthy data; others are excluded rather than guessed.
  if (f.date && isValidDate(f.date) && f.time && /^\d{2}:\d{2}$/.test(f.time)) {
    const [h, m] = f.time.split(":").map(Number);
    const minute = h * 60 + m;
    const checked = await Promise.all(
      rows.map(async (r) => {
        if (r.availabilityMode !== "LIVE") return { ...r, openSlot: false };
        const a = await getAvailability(r.id, f.date!, 60);
        const ok = a.configs.some(
          (c) => (!f.format || c.playersPerSide === Number(f.format)) && c.slots.some((s) => s.startMinute === minute && s.status === "available"),
        );
        return { ...r, openSlot: ok };
      }),
    );
    rows = checked.filter((r) => r.openSlot);
  }

  const sort = f.sort ?? (origin ? "distance" : "best");
  const live = (r: (typeof rows)[number]) => Number(r.availabilityMode === "LIVE");
  rows.sort((a, b) =>
    sort === "distance" && origin
      ? a.distanceKm! - b.distanceKm!
      : sort === "price"
        ? (a.minPrice ?? a.reportedPriceFrom ?? 1e12) - (b.minPrice ?? b.reportedPriceFrom ?? 1e12)
        : sort === "rating"
          ? b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount
          : // Best match: featured, then turfs you can book here, then the best rated.
            Number(b.isFeatured) - Number(a.isFeatured) || live(b) - live(a) || b.ratingAvg - a.ratingAvg,
  );
  return rows;
}

export type TurfCard = Awaited<ReturnType<typeof searchTurfs>>[number];
