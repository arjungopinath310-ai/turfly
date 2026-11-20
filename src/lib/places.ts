/**
 * Towns and cities anywhere in India. Turfly has no fixed list of cities: a town is added the first time a
 * turf there is registered or discovered, and reused after that.
 */
import { prisma } from "./db";
import { slugify } from "./ids";
import { boundingBox, haversineKm } from "./search";

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
  "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
  "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
  "Ladakh", "Lakshadweep", "Puducherry",
] as const;

/** The state's name as we list it, matched loosely ("kerala", "KL" style inputs from forms or map data). */
export function normalizeState(s: string | null | undefined): string | null {
  const v = (s ?? "").trim().toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ");
  if (!v) return null;
  return INDIAN_STATES.find((x) => x.toLowerCase() === v) ?? INDIAN_STATES.find((x) => v.includes(x.toLowerCase())) ?? null;
}

const tidy = (s: string) => s.trim().replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60);

/** The town with this name in this state, created (at the given position) if Turfly hasn't seen it yet. */
export async function findOrCreateCity(input: { name: string; state: string; lat: number; lng: number; district?: string | null }) {
  const name = tidy(input.name);
  const state = normalizeState(input.state) ?? tidy(input.state);
  const existing = await prisma.city.findFirst({ where: { name: { equals: name, mode: "insensitive" }, state: { equals: state, mode: "insensitive" } } });
  if (existing) {
    if (!existing.isActive) await prisma.city.update({ where: { id: existing.id }, data: { isActive: true } });
    return existing;
  }
  let slug = slugify(name) || "town";
  if (await prisma.city.findUnique({ where: { slug } })) slug = slugify(`${name}-${state}`);
  if (await prisma.city.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  return prisma.city.create({ data: { slug, name, state, district: input.district ?? null, lat: input.lat, lng: input.lng, pincodes: [] } });
}

/** The closest town Turfly already knows within `km` of a point, or null. */
export async function nearestCity(lat: number, lng: number, km = 20) {
  const b = boundingBox(lat, lng, km);
  const near = await prisma.city.findMany({ where: { lat: { gte: b.minLat, lte: b.maxLat }, lng: { gte: b.minLng, lte: b.maxLng } } });
  let best: (typeof near)[number] | null = null;
  let bestKm = Infinity;
  for (const c of near) {
    const d = haversineKm({ lat, lng }, c);
    if (d < bestKm && d <= km) [best, bestKm] = [c, d];
  }
  return best;
}
