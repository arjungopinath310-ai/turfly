/**
 * Lists every football turf in India that OpenStreetMap knows, as unclaimed Turfly listings. Safe to run again and
 * to stop at any time: finished map tiles are remembered for 30 days and turfs already listed are skipped.
 *
 *   npx tsx scripts/import-turfs-india.ts                         all of India, nearest to Malappuram first (hours)
 *   npx tsx scripts/import-turfs-india.ts --box 8,74,13,78        only tiles inside south,west,north,east
 *   npx tsx scripts/import-turfs-india.ts --force                 re-fetch tiles done in the last 30 days
 *
 * Writes to DATABASE_URL (.env). Back up first (scripts\backup-db.ps1).
 */
import { prisma } from "../src/lib/db";
import { fetchTile, importTile, indiaTiles, markTile, tileDone, type Tile } from "../src/lib/import-india";

const args = process.argv.slice(2);
const force = args.includes("--force");
const boxArg = args.includes("--box") ? args[args.indexOf("--box") + 1].split(",").map(Number) : null;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A tile, tried up to three times: the public servers are often briefly overloaded. */
async function fetchWithRetry(t: Tile) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchTile(t);
    } catch (e) {
      if (attempt >= 3) throw e;
      await pause(attempt * 45_000);
    }
  }
}

async function main() {
  const tiles = boxArg ? indiaTiles(undefined, { s: boxArg[0], w: boxArg[1], n: boxArg[2], e: boxArg[3] }) : indiaTiles();
  console.log(`${tiles.length} map tiles to check`);
  let added = 0;
  let found = 0;
  const failed: Tile[] = [];
  for (const [i, t] of tiles.entries()) {
    if (!force && (await tileDone(t))) continue;
    const t0 = Date.now();
    try {
      const r = await importTile(await fetchWithRetry(t));
      await markTile(t, r);
      added += r.added;
      found += r.found;
      console.log(`[${i + 1}/${tiles.length}] ${t.key}: ${r.found} on the map, ${r.added} new, ${r.photos} photos, ${r.towns} towns (${Math.round((Date.now() - t0) / 1000)} s) · total new ${added}`);
    } catch (e) {
      failed.push(t);
      console.log(`[${i + 1}/${tiles.length}] ${t.key}: failed (${String(e).slice(0, 120)}); will retry at the end`);
    }
    await pause(3000); // be gentle with the public servers
  }
  // one more try for tiles that failed (busy servers)
  for (const t of failed) {
    try {
      const r = await importTile(await fetchTile(t));
      await markTile(t, r);
      added += r.added;
      console.log(`retry ${t.key}: ${r.found} on the map, ${r.added} new`);
    } catch (e) {
      console.log(`retry ${t.key}: failed again; run this script later to finish it`);
    }
    await pause(5000);
  }
  console.log(`Finished: ${found} turfs seen, ${added} new listings.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
