/**
 * Lists every football turf in India that OpenStreetMap knows, as unclaimed listings. India is fetched in 1° map
 * tiles (location queries are fast on the public servers, unlike lookups by state name), nearest to Malappuram
 * first. Each tile also brings its cities and towns with their state, and every turf is filed under its town:
 * the town in its address, else the nearest city or town. Turfs nearest a town outside India are skipped.
 * Run with scripts/import-turfs-india.ts; on-demand discovery near players (discover.ts) keeps lists fresh.
 */
import { prisma } from "./db";
import { overpassQuery, saveListings, toListing, type Listing, type OsmElement } from "./discover";
import { findOrCreateCity, normalizeState } from "./places";
import { haversineKm } from "./search";

export type Tile = { s: number; w: number; n: number; e: number; key: string };

const INDIA = { s: 6, w: 68, n: 37, e: 98 };
const PLACE_MARGIN = 0.35; // towns just outside the tile still count as "nearest town"
const MAX_TOWN_KM = 60;

/** All 1° tiles over India's bounding box, nearest to `from` first. */
export function indiaTiles(from = { lat: 11.1, lng: 76.1 }, box = INDIA): Tile[] {
  const tiles: Tile[] = [];
  for (let s = box.s; s < box.n; s++) for (let w = box.w; w < box.e; w++) tiles.push({ s, w, n: s + 1, e: w + 1, key: `tile:${s},${w}` });
  const d = (t: Tile) => haversineKm(from, { lat: t.s + 0.5, lng: t.w + 0.5 });
  return tiles.sort((a, b) => d(a) - d(b));
}

export function tileQuery(t: Tile) {
  const bb = `${t.s},${t.w},${t.n},${t.e}`;
  const pb = `${t.s - PLACE_MARGIN},${t.w - PLACE_MARGIN},${t.n + PLACE_MARGIN},${t.e + PLACE_MARGIN}`;
  return (
    `[out:json][timeout:240];` +
    `(nwr["leisure"="pitch"]["sport"~"soccer|football|futsal"](${bb});nwr["leisure"="sports_centre"]["sport"~"soccer|football|futsal"](${bb});nwr["leisure"~"^(pitch|sports_centre|sports_hall)$"]["name"~"turf|futsal|arena",i](${bb}););out center tags;` +
    // each town, followed by the state it is in
    `node["place"~"^(city|town)$"](${pb})->.places;foreach.places->.p(.p out body;.p is_in->.a;area.a["admin_level"="4"]["boundary"="administrative"];out tags;);`
  );
}

export async function fetchTile(t: Tile) {
  return overpassQuery(tileQuery(t), 270_000);
}

type Place = { name: string; lat: number; lng: number; state: string | null; india: boolean };

/** Towns (with their state) and turf listings from a tile's map data. */
export function parseTile(elements: OsmElement[]) {
  const places: Place[] = [];
  const listings: Listing[] = [];
  let current: Place | null = null;
  for (const e of elements) {
    if (e.type === "node" && e.tags?.place) {
      const name = (e.tags["name:en"] || e.tags.name || "").trim();
      current = name && e.lat != null && e.lon != null ? { name, lat: e.lat, lng: e.lon, state: null, india: false } : null;
      if (current) places.push(current);
    } else if (e.type === "area") {
      if (current && !current.state) {
        current.india = /^IN-/.test(e.tags?.["ISO3166-2"] ?? "");
        current.state = normalizeState(e.tags?.["name:en"] || e.tags?.name);
      }
    } else {
      const l = toListing(e, {});
      if (l) listings.push(l);
    }
  }
  return { places, listings };
}

/** The nearest Indian town (with a known state) to a listing. */
export function nearestTown(l: { lat: number; lng: number }, places: Place[]) {
  let best: Place | null = null;
  let bestKm = Infinity;
  for (const p of places) {
    if (!p.india || !p.state) continue;
    const d = haversineKm(l, p);
    if (d < bestKm) [best, bestKm] = [p, d];
  }
  return best && bestKm <= MAX_TOWN_KM ? best : null;
}

/** Saves a tile's turfs (skipping ones already listed) under their towns. */
export async function importTile(elements: OsmElement[]) {
  const { places, listings } = parseTile(elements);
  const cities = new Map<string, { id: string; name: string }>();
  const r = await saveListings(listings, async (l) => {
    const near = nearestTown(l, places);
    if (!near) return null; // outside India, or nowhere near a town we know
    const name = l.town ?? near.name;
    const key = `${name.toLowerCase()}|${near.state}`;
    if (!cities.has(key)) cities.set(key, await findOrCreateCity({ name, state: near.state!, lat: l.town ? l.lat : near.lat, lng: l.town ? l.lng : near.lng }));
    return cities.get(key)!;
  });
  return { found: listings.length, towns: places.filter((p) => p.india).length, ...r };
}

/** Remembers that a tile was imported (so a re-run skips it unless forced). */
export async function markTile(t: Tile, r: { found: number; added: number }) {
  await prisma.discoveryCell.upsert({ where: { key: t.key }, update: { fetchedAt: new Date(), found: r.found, added: r.added }, create: { key: t.key, fetchedAt: new Date(), found: r.found, added: r.added } });
}

export async function tileDone(t: Tile, withinDays = 30) {
  const c = await prisma.discoveryCell.findUnique({ where: { key: t.key } });
  return Boolean(c && Date.now() - c.fetchedAt.getTime() < withinDays * 86_400_000);
}
