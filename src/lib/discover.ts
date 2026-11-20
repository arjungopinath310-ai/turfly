/**
 * Finds football turfs near a player anywhere in India from OpenStreetMap (free public map data, no API key)
 * and lists them as unclaimed turfs: name, place, map position and phone where known. Players can call or get
 * directions; the owner can claim the listing to take online bookings.
 *
 * Privacy: only the centre of the ~10 km square the player is in is sent to the map server, never their
 * position. Each square is looked up at most once every REFRESH_DAYS, and the servers are asked one at a time.
 * Map data © OpenStreetMap contributors (ODbL); turf pages that came from it say so.
 */
import { prisma } from "./db";
import { slugify } from "./ids";
import { normalizePhone } from "./otp";
import { findOrCreateCity, nearestCity, normalizeState } from "./places";
import { haversineKm } from "./search";

const SERVERS = (process.env.OVERPASS_URLS || "https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter,https://overpass.private.coffee/api/interpreter")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const REFRESH_DAYS = 14;
const RADIUS_M = 15_000; // covers the whole 0.1° square plus a margin, whichever corner the player is in
const MAX_LOOKUPS_PER_HOUR = 120;
const SAME_PLACE_KM = 0.12; // two listings this close are the same turf

/** India's bounding box: discovery is for Indian turfs only. */
export const inIndia = (lat: number, lng: number) => lat >= 6 && lat <= 37.6 && lng >= 68 && lng <= 97.5;

/** The ~10 km square a point is in, and its centre (the only position ever sent to the map server). */
export function cellOf(lat: number, lng: number) {
  const a = Math.floor(lat * 10) / 10;
  const b = Math.floor(lng * 10) / 10;
  return { key: `${a.toFixed(1)},${b.toFixed(1)}`, lat: +(a + 0.05).toFixed(2), lng: +(b + 0.05).toFixed(2) };
}

export type OsmElement = { type: "node" | "way" | "relation" | "area"; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

const TURFISH = /turf|arena|futsal|soccer|football|fives|5s|7s|kick|goal|striker|club\s*\d|sports/i;
// Schools, colleges and public grounds ("… Football Ground") aren't turfs you can book, unless the name says turf/arena/futsal
const NOT_A_TURF = /school|college|\bh\.?s\.?s?\b|higher secondary|university|vidyalaya|navodaya|\bj\.?\s?n\.?\s?v\b|parade|maidan(am)?$|maithanam|panchayath|\bground\b|stadium/i;
const GENERIC = /^(football |soccer )?(turf|ground|field)$/i;

/** Whether a map feature looks like a bookable football turf (named, not a school or public ground). */
export function looksLikeTurf(tags: Record<string, string> = {}) {
  const name = tags.name?.trim();
  if (!name || name.length < 3) return false;
  const sport = (tags.sport ?? "").toLowerCase();
  const football = /soccer|football|futsal/.test(sport);
  const otherSportOnly = Boolean(sport) && !football;
  if (otherSportOnly && !/turf|futsal|football|soccer/i.test(name)) return false; // badminton courts etc.
  if (NOT_A_TURF.test(name) && !/turf|futsal|arena/i.test(name)) return false;
  const artificial = /artificial|synthetic|grass_paver/.test(tags.surface ?? "");
  return artificial || TURFISH.test(name) || (football && tags.leisure === "sports_centre");
}

type Areas = { town?: string; district?: string; state?: string };

/** Town, district and state from the admin areas the map server returned for the square's centre. */
export function areasFrom(elements: OsmElement[]): Areas {
  const byLevel: Record<string, string> = {};
  for (const e of elements) {
    if (e.type !== "area" || !e.tags?.admin_level) continue;
    if (e.tags.boundary && e.tags.boundary !== "administrative") continue; // development authorities etc.
    const name = e.tags["name:en"] || e.tags.name;
    if (name && !byLevel[e.tags.admin_level]) byLevel[e.tags.admin_level] = name;
  }
  // The town is the most local area that is a real place: not a planning region ("Pune Metropolitan Region") or
  // one part of a city ("Bengaluru West City Corporation"); "Kochi Municipal Corporation" counts as "Kochi".
  const placeName = (n?: string) => {
    if (!n || /region|division|agglomeration|metropolitan|authority|development|zone|circle|ward/i.test(n)) return undefined;
    const bare = n.replace(/\s+(city\s+)?(municipal\s+)?(corporation|municipality|council|nagar palika|nagar nigam|taluka|tehsil|tahsil|mandal|block)$/i, "");
    return /\b(north|south|east|west|central)$/i.test(bare) && bare !== n ? undefined : bare;
  };
  const town = ["8", "7", "6", "5"].map((l) => placeName(byLevel[l])).find(Boolean);
  return { town, district: byLevel["5"], state: byLevel["4"] };
}

export type Listing = { ref: string; name: string; lat: number; lng: number; town?: string; locality?: string; addressLine?: string; pincode: string; phone: string | null; amenities: string[] };

/** A map feature as a turf listing (or null if it isn't one). */
export function toListing(e: OsmElement, areas: Areas): Listing | null {
  if (e.type === "area" || !looksLikeTurf(e.tags)) return null;
  const t = e.tags!;
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  if (lat == null || lng == null) return null;
  // "Bavdhan, Pune" in a city tag means the area Bavdhan in the town Pune
  const cityTag = (t["addr:city"] || t["addr:town"] || "").split(",").map((x) => x.trim()).filter(Boolean);
  const town = cityTag.length ? cityTag[cityTag.length - 1] : areas.town;
  const locality = t["addr:suburb"] || t["addr:village"] || t["addr:place"] || t["addr:hamlet"] || (cityTag.length > 1 ? cityTag[0] : undefined);
  const nice = t.name.trim().replace(/\s+/g, " ").replace(/,(?=\S)/g, ", ");
  const name = GENERIC.test(nice) ? `Football Turf, ${locality ?? town ?? "nearby"}` : nice.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  const street = [t["addr:housename"], t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(", ");
  const phoneRaw = t.phone || t["contact:phone"] || t["contact:mobile"] || "";
  const phone = phoneRaw ? normalizePhone(phoneRaw.split(/[;,/]/)[0]) : null;
  const amenities = [t.lit === "yes" ? "floodlights" : null, t.parking ? "parking" : null].filter((x): x is string => Boolean(x));
  return {
    ref: `${e.type}/${e.id}`,
    name: name.slice(0, 80),
    lat,
    lng,
    town,
    locality,
    addressLine: street || undefined,
    pincode: /^\d{6}$/.test(t["addr:postcode"] ?? "") ? t["addr:postcode"] : "",
    phone,
    amenities,
  };
}

function query(lat: number, lng: number) {
  const around = `around:${RADIUS_M},${lat},${lng}`;
  // Every filter starts from the indexed "leisure" key, so dense cities stay fast
  return `[out:json][timeout:80];(nwr["leisure"="pitch"]["sport"~"soccer|football|futsal"](${around});nwr["leisure"="sports_centre"]["sport"~"soccer|football|futsal"](${around});nwr["leisure"~"^(pitch|sports_centre|sports_hall)$"]["name"~"turf|futsal|arena",i](${around}););out center tags 300;is_in(${lat},${lng})->.a;area.a["admin_level"~"^(4|5|6|7|8)$"];out tags;`;
}

export type Fetcher = (lat: number, lng: number) => Promise<OsmElement[]>;

/** Asks the public map servers in turn; throws if none answers. */
export const overpassFetcher: Fetcher = async (lat, lng) => {
  let last: unknown = null;
  for (const url of SERVERS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Turfly/1.0 (football turf finder)" },
        body: new URLSearchParams({ data: query(lat, lng) }),
        signal: AbortSignal.timeout(90_000), // busy public servers can take over a minute for a big city
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { elements?: OsmElement[] };
      return j.elements ?? [];
    } catch (e) {
      last = e;
    }
  }
  throw new Error(`map servers unavailable: ${String(last)}`);
};

const running = new Map<string, Promise<{ found: number; added: number }>>();
const recentLookups: number[] = [];

/**
 * Lists the turfs around a point (once per square per REFRESH_DAYS). Returns how many new listings were added;
 * `cached` when the square was looked up recently. Several requests for one square share one lookup.
 */
export async function discoverAround(lat: number, lng: number, opts: { fetcher?: Fetcher; force?: boolean } = {}) {
  if (!inIndia(lat, lng)) return { status: "outside" as const, added: 0 };
  const cell = cellOf(lat, lng);
  const seen = await prisma.discoveryCell.findUnique({ where: { key: cell.key } });
  if (!opts.force && seen && Date.now() - seen.fetchedAt.getTime() < REFRESH_DAYS * 86_400_000) return { status: "cached" as const, added: 0 };

  let job = running.get(cell.key);
  if (!job) {
    const hourAgo = Date.now() - 3_600_000;
    while (recentLookups.length && recentLookups[0] < hourAgo) recentLookups.shift();
    if (recentLookups.length >= MAX_LOOKUPS_PER_HOUR) return { status: "busy" as const, added: 0 };
    recentLookups.push(Date.now());
    job = (async () => {
      let elements: OsmElement[];
      try {
        elements = await (opts.fetcher ?? overpassFetcher)(cell.lat, cell.lng);
      } catch (e) {
        // map servers busy: try this square again in about an hour rather than on every visit
        const retryAt = new Date(Date.now() - REFRESH_DAYS * 86_400_000 + 3_600_000);
        await prisma.discoveryCell.upsert({ where: { key: cell.key }, update: { fetchedAt: retryAt }, create: { key: cell.key, fetchedAt: retryAt } });
        throw e;
      }
      const r = await importListings(elements, cell);
      await prisma.discoveryCell.upsert({ where: { key: cell.key }, update: { fetchedAt: new Date(), ...r }, create: { key: cell.key, fetchedAt: new Date(), ...r } });
      return r;
    })().finally(() => running.delete(cell.key));
    running.set(cell.key, job);
  }
  const r = await job;
  return { status: "done" as const, ...r };
}

/** Adds the listings that aren't on Turfly yet (by map id, or any turf at the same spot). */
export async function importListings(elements: OsmElement[], centre: { lat: number; lng: number }) {
  const areas = areasFrom(elements);
  const state = normalizeState(areas.state);
  const listings = elements.map((e) => toListing(e, areas)).filter((x): x is Listing => x != null);
  if (!listings.length || !state) return { found: listings.length, added: 0 };

  // Existing turfs around here (any source), to skip ones already listed
  const near = await prisma.turf.findMany({
    where: { isSandbox: false, lat: { gte: centre.lat - 0.25, lte: centre.lat + 0.25 }, lng: { gte: centre.lng - 0.25, lte: centre.lng + 0.25 } },
    select: { lat: true, lng: true, sourceRef: true },
  });
  const refs = new Set(near.map((t) => t.sourceRef).filter(Boolean));
  const spots: { lat: number; lng: number }[] = near.map((t) => ({ lat: t.lat, lng: t.lng }));
  const centreTown = areas.town ? await findOrCreateCity({ name: areas.town, state, lat: centre.lat, lng: centre.lng, district: areas.district }) : await nearestCity(centre.lat, centre.lng, 30);

  let added = 0;
  for (const l of listings) {
    if (refs.has(l.ref) || spots.some((s) => haversineKm(s, l) < SAME_PLACE_KM)) continue;
    const city =
      l.town && l.town.toLowerCase() !== centreTown?.name.toLowerCase()
        ? ((await nearestCity(l.lat, l.lng, 6)) ?? (await findOrCreateCity({ name: l.town, state, lat: l.lat, lng: l.lng, district: areas.district })))
        : (centreTown ?? (await nearestCity(l.lat, l.lng, 30)));
    if (!city) continue;
    let slug = slugify(`${l.name}-${city.name}`) || `turf-${l.ref.replace("/", "-")}`;
    if (await prisma.turf.findUnique({ where: { slug }, select: { id: true } })) slug = `${slug}-${l.ref.split("/")[1].slice(-5)}`;
    try {
      await prisma.turf.create({
        data: {
          slug,
          name: l.name,
          cityId: city.id,
          addressLine: l.addressLine ?? l.locality ?? city.name,
          locality: l.locality ?? null, // the town is shown anyway; don't repeat it
          pincode: l.pincode,
          lat: l.lat,
          lng: l.lng,
          phone: l.phone,
          amenities: l.amenities,
          status: "UNCLAIMED",
          availabilityMode: "NONE",
          source: "osm",
          sourceRef: l.ref,
          sourceNote: `Found on OpenStreetMap (${l.ref}). Details may be incomplete until the owner claims this listing.`,
        },
      });
      added++;
      spots.push(l);
      refs.add(l.ref);
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e; // another request listed it first
    }
  }
  return { found: listings.length, added };
}
