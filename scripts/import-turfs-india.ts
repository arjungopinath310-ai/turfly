/**
 * Lists every football turf in India that OpenStreetMap knows, as unclaimed Turfly listings. Safe to run again and
 * to stop at any time: finished map tiles are remembered for 30 days and turfs already listed are skipped.
 *
 * How it stays fast:
 *  - It fetches every state's towns ONCE (the state is known because we ask state by state) and caches them in
 *    .turfly-town-cache.json. Each map tile then only has to fetch turfs and match them to the nearest known town.
 *  - Tiles with no town within ~66 km (open sea, or abroad) are skipped without a request.
 *  - The map servers are used at the same time (each one request at a time), so three mirrors ≈ three times faster.
 *
 *   npx tsx scripts/import-turfs-india.ts                      all of India, nearest to Malappuram first
 *   npx tsx scripts/import-turfs-india.ts --box 8,74,13,78     only tiles inside south,west,north,east
 *   npx tsx scripts/import-turfs-india.ts --step 2             2° tiles (fewer, larger requests)
 *   npx tsx scripts/import-turfs-india.ts --force              re-fetch tiles done in the last 30 days
 *   npx tsx scripts/import-turfs-india.ts --refresh-towns      rebuild the town cache first
 *
 * Writes to DATABASE_URL (.env). Back up first (scripts\backup-db.ps1).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/db";
import { SERVERS, overpassOn } from "../src/lib/discover";
import { ALL_STATES, fetchStateTowns, importTileTurfs, indiaTiles, markTile, tileDone, tileHasTown, tileQueryTurfs, type Place, type Tile } from "../src/lib/import-india";

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const val = (f: string) => (has(f) ? args[args.indexOf(f) + 1] : null);
const force = has("--force");
const refreshTowns = has("--refresh-towns");
const step = Math.max(1, Number(val("--step") ?? 1) || 1);
const boxArg = val("--box")?.split(",").map(Number) ?? null;

const CACHE = join(process.cwd(), ".turfly-town-cache.json");
const CACHE_DAYS = 30;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tries the servers in turn, each worker starting at a different one so the mirrors are used at the same time. */
async function fetchRotating(q: string, ms: number, start = 0) {
  let last: unknown = null;
  for (let i = 0; i < SERVERS.length; i++) {
    try {
      return await overpassOn(SERVERS[(start + i) % SERVERS.length], q, ms);
    } catch (e) {
      last = e;
      await pause(2000);
    }
  }
  throw last;
}

/** Runs `job` over `items` with one worker per map server (each server one request at a time). */
async function pool<T>(items: T[], job: (item: T, worker: number) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.max(1, SERVERS.length) }, (_, worker) =>
      (async () => {
        for (;;) {
          const item = queue.shift();
          if (item === undefined) break;
          await job(item, worker);
        }
      })(),
    ),
  );
}

type Cache = { builtAt: string; states: Record<string, Place[]> };

function loadCache(): Cache {
  if (!refreshTowns && existsSync(CACHE)) {
    try {
      const c = JSON.parse(readFileSync(CACHE, "utf8")) as Cache;
      if (c.states && Date.now() - new Date(c.builtAt).getTime() < CACHE_DAYS * 86_400_000) return c;
    } catch {}
  }
  return { builtAt: new Date().toISOString(), states: {} };
}

/** All India towns with their state, fetched once per state and cached to disk (resumable). */
async function townCache(): Promise<Place[]> {
  const cache = loadCache();
  const todo = ALL_STATES.filter((s) => !cache.states[s]);
  if (todo.length) {
    console.log(`Fetching towns for ${todo.length} state(s) (one-time, cached to .turfly-town-cache.json)…`);
    let done = ALL_STATES.length - todo.length;
    await pool(todo, async (state, worker) => {
      try {
        const towns = await fetchStateTowns(state, (q, ms) => fetchRotating(q, ms ?? 250_000, worker));
        cache.states[state] = towns;
        writeFileSync(CACHE, JSON.stringify(cache));
        console.log(`  towns ${++done}/${ALL_STATES.length}: ${state} — ${towns.length}`);
      } catch (e) {
        console.log(`  towns: ${state} failed (${String(e).slice(0, 80)}); run again later to finish it`);
      }
      await pause(1500);
    });
  }
  const towns = Object.values(cache.states).flat();
  console.log(`${towns.length} towns across ${Object.keys(cache.states).length} states.`);
  return towns;
}

async function main() {
  const towns = await townCache();
  if (!towns.length) {
    console.log("No towns cached yet (the map servers were unreachable). Try again in a few minutes.");
    return;
  }
  const box = boxArg ? { s: boxArg[0], w: boxArg[1], n: boxArg[2], e: boxArg[3] } : undefined;
  const all = indiaTiles(undefined, box, step);
  const onLand = all.filter((t) => tileHasTown(t, towns));
  console.log(`${all.length} tiles in range, ${onLand.length} with a town nearby (the rest are sea or abroad).`);

  let added = 0;
  let found = 0;
  let scanned = 0;
  const failed: Tile[] = [];
  await pool(onLand, async (t, worker) => {
    if (!force && (await tileDone(t))) {
      scanned++;
      return;
    }
    const t0 = Date.now();
    try {
      const els = await fetchRotating(tileQueryTurfs(t), 130_000, worker);
      const r = await importTileTurfs(els, towns);
      await markTile(t, r);
      added += r.added;
      found += r.found;
      console.log(`[${++scanned}/${onLand.length}] ${t.key}: ${r.found} on the map, ${r.added} new, ${r.photos} photos (${Math.round((Date.now() - t0) / 1000)}s) · total new ${added}`);
    } catch (e) {
      failed.push(t);
      console.log(`[${++scanned}/${onLand.length}] ${t.key}: failed (${String(e).slice(0, 90)}); will retry at the end`);
    }
    await pause(1000);
  });

  // one more try for tiles that failed (busy servers)
  for (const t of failed) {
    try {
      const r = await importTileTurfs(await fetchRotating(tileQueryTurfs(t), 130_000), towns);
      await markTile(t, r);
      added += r.added;
      console.log(`retry ${t.key}: ${r.found} on the map, ${r.added} new`);
    } catch {
      console.log(`retry ${t.key}: failed again; run this script later to finish it`);
    }
    await pause(2000);
  }
  console.log(`Finished: ${found} turfs seen, ${added} new listings.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
