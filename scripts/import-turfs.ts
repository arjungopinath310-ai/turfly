/**
 * Adds real turfs from public information as UNCLAIMED listings (contact and directions only, no booking),
 * the same kind of listing as Admin > Turfs > "Add unclaimed listing". Owners claim them later.
 *
 *   npx tsx scripts/import-turfs.ts prisma/data/turfs-manjeri-malappuram.json --dry-run   (shows what would change)
 *   npx tsx scripts/import-turfs.ts prisma/data/turfs-manjeri-malappuram.json             (writes to DATABASE_URL)
 *
 * Safe to run again: a listing with the same slug is updated only while it is still UNCLAIMED (its claim link
 * is kept); claimed, approved or demo turfs are never touched. A turf already on the map within 75 m under
 * another name is skipped as a likely duplicate.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { slugify, token } from "../src/lib/ids";

/** Same formula as src/lib/search.ts (not imported, so this script doesn't load the app's database client). */
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

interface Row {
  name: string;
  city: string;
  addressLine: string;
  locality: string | null;
  pincode: string;
  lat: number;
  lng: number;
  osm: string;
  alsoListed?: string;
  description?: string;
  phone?: string;
  amenities?: string[];
}

const [file, ...flags] = process.argv.slice(2);
const dryRun = flags.includes("--dry-run");
if (!file) {
  console.error("Usage: npx tsx scripts/import-turfs.ts <data.json> [--dry-run]");
  process.exit(1);
}
const data = JSON.parse(readFileSync(file, "utf8")) as { checked: string; turfs: Row[] };

function validate(r: Row) {
  const errs: string[] = [];
  if (!r.name || r.name.trim().length < 3) errs.push("name");
  if (!/^\d{6}$/.test(r.pincode)) errs.push("pincode");
  if (!(r.lat > 8 && r.lat < 13 && r.lng > 74 && r.lng < 78)) errs.push("lat/lng outside Kerala");
  if (!r.addressLine || r.addressLine.trim().length < 5) errs.push("addressLine");
  if (!/^(node|way|relation)\/\d+$/.test(r.osm)) errs.push("osm");
  return errs;
}

const sourceNote = (r: Row) =>
  `OpenStreetMap (© OpenStreetMap contributors, ${r.osm})${r.alsoListed ? `, also listed on ${r.alsoListed}` : ""}; checked ${data.checked}. Not yet confirmed by the turf.`.slice(0, 300);

async function main() {
  const prisma = new PrismaClient();
  const cities = new Map((await prisma.city.findMany()).map((c) => [c.slug, c]));
  const existing = await prisma.turf.findMany({ select: { id: true, slug: true, name: true, status: true, isDemo: true, lat: true, lng: true } });
  const counts = { created: 0, updated: 0, skipped: 0 };

  for (const r of data.turfs) {
    const errs = validate(r);
    const city = cities.get(r.city);
    if (!city) errs.push(`unknown city "${r.city}"`);
    if (errs.length) {
      console.log(`SKIP    ${r.name}: invalid ${errs.join(", ")}`);
      counts.skipped++;
      continue;
    }
    const slug = slugify(r.name);
    const same = existing.find((t) => t.slug === slug);
    const near = existing.find((t) => t.slug !== slug && !t.isDemo && haversineKm(t, r) < 0.075);
    if (near) {
      console.log(`SKIP    ${r.name}: "${near.name}" is already listed ${Math.round(haversineKm(near, r) * 1000)} m away`);
      counts.skipped++;
      continue;
    }
    if (same && (same.status !== "UNCLAIMED" || same.isDemo)) {
      console.log(`SKIP    ${r.name}: /turfs/${slug} exists and is ${same.isDemo ? "a demo listing" : same.status} (left as it is)`);
      counts.skipped++;
      continue;
    }
    const fields = {
      name: r.name.trim(),
      cityId: city!.id,
      addressLine: r.addressLine.trim(),
      locality: r.locality?.trim() || null,
      pincode: r.pincode,
      lat: r.lat,
      lng: r.lng,
      description: r.description ?? null,
      phone: r.phone ?? null,
      amenities: r.amenities ?? [],
      sourceNote: sourceNote(r),
    };
    console.log(`${same ? "UPDATE" : "CREATE"}  ${fields.name} · ${fields.locality ?? city!.name}, ${city!.name} ${fields.pincode} · /turfs/${slug}`);
    if (dryRun) continue;
    if (same) {
      await prisma.turf.update({ where: { id: same.id }, data: fields });
      counts.updated++;
    } else {
      const t = await prisma.turf.create({
        data: { ...fields, slug, status: "UNCLAIMED", availabilityMode: "NONE", isDemo: false, claimToken: token(16) },
        select: { id: true, slug: true, name: true, status: true, isDemo: true, lat: true, lng: true },
      });
      existing.push(t);
      counts.created++;
    }
  }
  console.log(dryRun ? "\nDry run: nothing was written." : `\nDone: ${counts.created} added, ${counts.updated} updated, ${counts.skipped} skipped.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
