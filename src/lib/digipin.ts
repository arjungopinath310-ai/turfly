/**
 * DIGIPIN, India Post's digital address: a 10-character code for a ~4 m × 4 m cell anywhere in India.
 * Same grid and steps as India Post's open-source reference (github.com/INDIAPOST-gov/digipin, src/digipin.js):
 * each of 10 levels splits the current box into 4×4 and picks the cell's character.
 * Stored and copied as one continuous string ("4T396F42L7"); shown grouped 3-4-3 ("4T3 96F4 2L7").
 * Usable on server and client.
 */
const GRID = [
  ["F", "C", "9", "8"],
  ["J", "3", "2", "7"],
  ["K", "4", "5", "6"],
  ["L", "M", "P", "T"],
];
const BOUNDS = { minLat: 2.5, maxLat: 38.5, minLon: 63.5, maxLon: 99.5 };
const VALID = /^[23456789CJKLMPFT]{10}$/;

/** Latitude/longitude → DIGIPIN, or null outside India's DIGIPIN area. */
export function encodeDigipin(lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lon < BOUNDS.minLon || lon > BOUNDS.maxLon) return null;
  let { minLat, maxLat, minLon, maxLon } = BOUNDS;
  let pin = "";
  for (let level = 1; level <= 10; level++) {
    const latDiv = (maxLat - minLat) / 4;
    const lonDiv = (maxLon - minLon) / 4;
    const row = Math.max(0, Math.min(3 - Math.floor((lat - minLat) / latDiv), 3)); // rows run north → south
    const col = Math.max(0, Math.min(Math.floor((lon - minLon) / lonDiv), 3));
    pin += GRID[row][col];
    maxLat = minLat + latDiv * (4 - row);
    minLat = minLat + latDiv * (3 - row);
    minLon = minLon + lonDiv * col;
    maxLon = minLon + lonDiv;
  }
  return pin;
}

/** Accepts "4t3-96f-42l7", "4T3 96F4 2L7", "4T396F42L7" → "4T396F42L7" (null if not a DIGIPIN). */
export function normalizeDigipin(raw: string | null | undefined): string | null {
  const pin = (raw ?? "").toUpperCase().replace(/[\s-]/g, "");
  return VALID.test(pin) ? pin : null;
}

/** DIGIPIN → centre of its cell, or null if invalid. */
export function decodeDigipin(raw: string): { lat: number; lng: number } | null {
  const pin = normalizeDigipin(raw);
  if (!pin) return null;
  let { minLat, maxLat, minLon, maxLon } = BOUNDS;
  for (const ch of pin) {
    const r = GRID.findIndex((row) => row.includes(ch));
    const c = GRID[r].indexOf(ch);
    const latDiv = (maxLat - minLat) / 4;
    const lonDiv = (maxLon - minLon) / 4;
    const lat1 = maxLat - latDiv * (r + 1);
    const lat2 = maxLat - latDiv * r;
    const lon1 = minLon + lonDiv * c;
    const lon2 = minLon + lonDiv * (c + 1);
    minLat = lat1;
    maxLat = lat2;
    minLon = lon1;
    maxLon = lon2;
  }
  return { lat: Number(((minLat + maxLat) / 2).toFixed(6)), lng: Number(((minLon + maxLon) / 2).toFixed(6)) };
}

/** "4T396F42L7" → "4T3 96F4 2L7" (India Post's optional 3-4-3 display grouping). */
export const formatDigipin = (pin: string) => `${pin.slice(0, 3)} ${pin.slice(3, 7)} ${pin.slice(7)}`;
