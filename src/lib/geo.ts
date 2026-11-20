/**
 * The player's last known position, kept on their device in a cookie so pages can show the nearest turfs
 * on the first render. Rounded to ~100 m; never saved to the account. Safe to import on the client.
 */
export const LOC_COOKIE = "turfly_loc";
export const LOC_MAX_AGE = 60 * 60 * 24 * 30; // seconds
export const LOC_FRESH_MS = 30 * 60_000; // older than this: ask the phone again (quietly, if already allowed)

export type Loc = { lat: number; lng: number; at: number };

export function parseLoc(v: string | undefined | null): Loc | null {
  if (!v) return null;
  const [lat, lng, at] = decodeURIComponent(v).split(",").map(Number);
  if (![lat, lng].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, at: Number.isFinite(at) ? at : 0 };
}

export const formatLoc = (lat: number, lng: number, at = Date.now()) => `${lat.toFixed(3)},${lng.toFixed(3)},${at}`;
