/**
 * Adds real turfs from public information as UNCLAIMED listings (contact, hours and directions only, no booking),
 * the same kind of listing as Admin > Turfs > "Add unclaimed listing". Owners claim them later.
 *
 *   npx tsx scripts/import-turfs.ts prisma/data/turfs-manjeri-malappuram.json --dry-run   (shows what would change)
 *   npx tsx scripts/import-turfs.ts prisma/data/turfs-manjeri-malappuram.json             (writes to DATABASE_URL)
 *
 * Safe to run again:
 *  - a turf is matched by its slug, or else by an unclaimed listing within MATCH_M metres (so renaming in the file updates it);
 *  - only UNCLAIMED, non-demo listings are ever changed; claimed, approved or demo turfs are left alone;
 *  - phone, hours and reported price are only written when the file has them, so values an admin entered are kept;
 *  - towns listed under "cities" are added if missing (existing towns are not changed).
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { slugify, token } from "../src/lib/ids";
import { AMENITIES } from "../src/lib/brand";

const MATCH_M = 120;

interface Hours {
  weekday: number;
  openMinute: number;
  closeMinute: number;
}
interface Source {
  name: string; // "TapTurf", "OpenStreetMap", "Justdial"…
  ref?: string; // e.g. OSM "way/123" or a page URL
}
interface Row {
  slug?: string;
  name: string;
  city: string;
  addressLine: string;
  locality?: string | null;
  pincode: string;
  lat: number;
  lng: number;
  phone?: string | null;
  hours?: Hours[];
  amenities?: string[];
  description?: string | null;
  sources: Source[];
  reportedPriceFrom?: number; // rupees per hour
  reportedPriceNote?: string;
}
interface CityRow {
  slug: string;
  name: string;
  lat: number;
  lng: number;
  pincodes: string[];
}

/** Same formula as src/lib/search.ts (not imported, so this script doesn't load the app's database client). */
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const [file, ...flags] = process.argv.slice(2);
const dryRun = flags.includes("--dry-run");
if (!file) {
  console.error("Usage: npx tsx scripts/import-turfs.ts <data.json> [--dry-run]");
  process.exit(1);
}
const data = JSON.parse(readFileSync(file, "utf8")) as { checked: string; cities?: CityRow[]; turfs: Row[] };

function validate(r: Row) {
  const errs: string[] = [];
  if (!r.name || r.name.trim().length < 3) errs.push("name");
  if (!/^\d{6}$/.test(r.pincode)) errs.push("pincode");
  if (!(r.lat > 8 && r.lat < 13 && r.lng > 74 && r.lng < 78)) errs.push("lat/lng outside Kerala");
  if (!r.addressLine || r.addressLine.trim().length < 3) errs.push("addressLine");
  if (!r.sources?.length) errs.push("sources");
  if (r.phone && !/^\+91[6-9]\d{9}$/.test(r.phone)) errs.push("phone (+91XXXXXXXXXX)");
  for (const h of r.hours ?? []) if (!(h.weekday >= 0 && h.weekday <= 6 && h.openMinute >= 0 && h.closeMinute > h.openMinute && h.closeMinute <= 1800)) errs.push("hours");
  for (const a of r.amenities ?? []) if (!(a in AMENITIES)) errs.push(`amenity "${a}"`);
  if (r.reportedPriceFrom != null && !(Number.isInteger(r.reportedPriceFrom) && r.reportedPriceFrom >= 100 && r.reportedPriceFrom <= 20000)) errs.push("reportedPriceFrom (rupees)");
  return errs;
}

function sourceNote(r: Row) {
  const parts = r.sources.map((s) => (s.name === "OpenStreetMap" ? `OpenStreetMap (© OpenStreetMap contributors${s.ref ? `, ${s.ref}` : ""})` : s.name));
  return `Listing details from ${parts.join(", ")}; checked ${data.checked}. Not yet confirmed by the turf.`.slice(0, 300);
}

async function main() {
  const prisma = new PrismaClient();

  // Towns
  const cities = new Map((await prisma.city.findMany()).map((c) => [c.slug, c]));
  for (const c of data.cities ?? []) {
    if (cities.has(c.slug)) continue;
    console.log(`TOWN    ${c.name} (${c.slug})`);
    if (!dryRun) {
      const created = await prisma.city.create({ data: { slug: c.slug, name: c.name, district: "Malappuram", state: "Kerala", lat: c.lat, lng: c.lng, pincodes: c.pincodes } });
      cities.set(c.slug, created);
    }
  }

  const existing = await prisma.turf.findMany({ select: { id: true, slug: true, name: true, status: true, isDemo: true, lat: true, lng: true } });
  const counts = { created: 0, updated: 0, skipped: 0 };
  const seen = new Set<string>();

  for (const r of data.turfs) {
    const errs = validate(r);
    const city = cities.get(r.city);
    if (!city && !(dryRun && data.cities?.some((c) => c.slug === r.city))) errs.push(`unknown town "${r.city}"`);
    if (errs.length) {
      console.log(`SKIP    ${r.name}: invalid ${errs.join(", ")}`);
      counts.skipped++;
      continue;
    }
    const slug = r.slug ?? slugify(r.name);
    const bySlug = existing.find((t) => t.slug === slug);
    const nearby = existing
      .filter((t) => !t.isDemo && t.slug !== slug && !seen.has(t.id))
      .map((t) => ({ t, m: haversineKm(t, r) * 1000 }))
      .filter((x) => x.m < MATCH_M)
      .sort((a, b) => a.m - b.m)[0];
    const match = bySlug ?? nearby?.t;
    if (match && (match.status !== "UNCLAIMED" || match.isDemo)) {
      console.log(`SKIP    ${r.name}: matches /turfs/${match.slug}, which is ${match.isDemo ? "a demo listing" : match.status} (left as it is)`);
      counts.skipped++;
      continue;
    }
    if (match && seen.has(match.id)) {
      console.log(`SKIP    ${r.name}: same place as another row in the file (/turfs/${match.slug})`);
      counts.skipped++;
      continue;
    }

    const fields = {
      name: r.name.trim(),
      cityId: city?.id ?? "(new town)",
      addressLine: r.addressLine.trim(),
      locality: r.locality?.trim() || null,
      pincode: r.pincode,
      lat: r.lat,
      lng: r.lng,
      description: r.description ?? null,
      amenities: r.amenities ?? [],
      sourceNote: sourceNote(r),
      ...(r.phone ? { phone: r.phone } : {}),
      ...(r.reportedPriceFrom != null
        ? { reportedPriceFrom: r.reportedPriceFrom * 100, reportedPriceNote: r.reportedPriceNote ?? null, reportedPriceAt: new Date() }
        : {}),
    };
    const label = `${fields.name} · ${fields.locality ?? r.city}, ${r.city} ${fields.pincode}${r.phone ? " · phone" : ""}${r.hours?.length ? " · hours" : ""}`;
    console.log(`${match ? "UPDATE" : "CREATE"}  ${label} · /turfs/${match?.slug ?? slug}${nearby && !bySlug ? ` (matched by location, ${Math.round(nearby.m)} m)` : ""}`);
    if (match) seen.add(match.id);
    if (dryRun) {
      match ? counts.updated++ : counts.created++;
      continue;
    }

    const turf = match
      ? await prisma.turf.update({ where: { id: match.id }, data: fields, select: { id: true, slug: true, name: true, status: true, isDemo: true, lat: true, lng: true } })
      : await prisma.turf.create({
          data: { ...fields, slug, status: "UNCLAIMED", availabilityMode: "NONE", isDemo: false, claimToken: token(16) },
          select: { id: true, slug: true, name: true, status: true, isDemo: true, lat: true, lng: true },
        });
    if (!match) existing.push(turf);
    seen.add(turf.id);
    if (r.hours?.length) {
      await prisma.$transaction([
        prisma.operatingHours.deleteMany({ where: { turfId: turf.id } }),
        prisma.operatingHours.createMany({ data: r.hours.map((h) => ({ turfId: turf.id, weekday: h.weekday, openMinute: h.openMinute, closeMinute: h.closeMinute })) }),
      ]);
    }
    match ? counts.updated++ : counts.created++;
  }
  console.log(`\n${dryRun ? "Dry run (nothing written): would add" : "Done: added"} ${counts.created}, ${dryRun ? "update" : "updated"} ${counts.updated}, skipped ${counts.skipped}.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
