/**
 * Resource-allocation model (pure, no DB).
 *
 * A turf owns *units* (atomic resources: "Half A", "Half B", or virtual locks).
 * A bookable *config* consumes a set of units. Two reservations conflict iff
 *   (unit sets intersect) AND (time ranges overlap, half-open [start, end)).
 *
 * For the convertible pitch:
 *   Full 7s = {A, B}, 5s Pitch A = {A}, 5s Pitch B = {B}
 * which yields exactly the required behaviour, evaluated per interval — never by merging
 * separate bookings into one larger block. The database enforces the same rule with an
 * EXCLUDE constraint, so this module is used for *display* and pre-validation only.
 */

export type OccupancyKind = "booked" | "held" | "blocked";

export interface OccupancyRow {
  unitId: string;
  start: number; // epoch ms
  end: number; // epoch ms
  kind: OccupancyKind;
}

export const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && bStart < aEnd;

const PRIORITY: Record<OccupancyKind, number> = { booked: 3, blocked: 2, held: 1 };

/** Worst occupancy affecting `unitIds` during [start, end), or null when free. */
export function intervalStatus(
  unitIds: readonly string[],
  start: number,
  end: number,
  occupancy: readonly OccupancyRow[],
): OccupancyKind | null {
  const units = new Set(unitIds);
  let worst: OccupancyKind | null = null;
  for (const o of occupancy) {
    if (!units.has(o.unitId) || !overlaps(start, end, o.start, o.end)) continue;
    if (!worst || PRIORITY[o.kind] > PRIORITY[worst]) worst = o.kind;
  }
  return worst;
}

export function configsConflict(aUnits: readonly string[], bUnits: readonly string[]) {
  const s = new Set(aUnits);
  return bUnits.some((u) => s.has(u));
}

// ───────────── Layout presets ─────────────

export interface LayoutUnit {
  key: string;
  name: string;
  isVirtual?: boolean;
}
export interface LayoutConfig {
  name: string;
  playersPerSide: number;
  unitKeys: string[];
  basePricePerHour: number; // paise
}
export interface Layout {
  units: LayoutUnit[];
  configs: LayoutConfig[];
}

/**
 * One 7-a-side pitch that can be split into two 5-a-side pitches.
 * - halvesSimultaneous=false adds a shared virtual lock so only one half runs at a time.
 * - allowCombined=false omits the full-pitch config (two permanent 5s pitches).
 */
export function convertiblePitchLayout(opts: {
  halvesSimultaneous: boolean;
  allowCombined: boolean;
  fullPricePerHour: number;
  halfPricePerHour: number;
}): Layout {
  const units: LayoutUnit[] = [
    { key: "A", name: "Half A" },
    { key: "B", name: "Half B" },
  ];
  if (!opts.halvesSimultaneous) units.push({ key: "LOCK", name: "Single-half operation lock", isVirtual: true });
  const halfUnits = (k: string) => (opts.halvesSimultaneous ? [k] : [k, "LOCK"]);
  const configs: LayoutConfig[] = [];
  if (opts.allowCombined)
    configs.push({ name: "Full pitch · 7-a-side", playersPerSide: 7, unitKeys: ["A", "B"], basePricePerHour: opts.fullPricePerHour });
  configs.push(
    { name: "Pitch A · 5-a-side", playersPerSide: 5, unitKeys: halfUnits("A"), basePricePerHour: opts.halfPricePerHour },
    { name: "Pitch B · 5-a-side", playersPerSide: 5, unitKeys: halfUnits("B"), basePricePerHour: opts.halfPricePerHour },
  );
  return { units, configs };
}

export function singlePitchLayout(playersPerSide: number, pricePerHour: number): Layout {
  return {
    units: [{ key: "MAIN", name: "Main pitch" }],
    configs: [{ name: `${playersPerSide}-a-side`, playersPerSide, unitKeys: ["MAIN"], basePricePerHour: pricePerHour }],
  };
}
