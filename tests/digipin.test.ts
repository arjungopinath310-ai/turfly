import { describe, expect, it } from "vitest";
import { decodeDigipin, encodeDigipin, formatDigipin, normalizeDigipin } from "@/lib/digipin";

describe("DIGIPIN (India Post)", () => {
  it("matches India Post's published examples", () => {
    // README of github.com/INDIAPOST-gov/digipin
    expect(encodeDigipin(13.11179621, 80.20264269)).toBe("4T396F42L7");
    expect(decodeDigipin("4P3JK852C9")).toEqual({ lat: 12.971601, lng: 77.594584 });
  });

  it("round-trips: the centre of a code encodes back to the same code", () => {
    for (const [lat, lng] of [[11.109207, 76.117281], [11.0828, 76.1523], [10.9762, 76.2254], [8.5241, 76.9366], [28.6129, 77.2295]]) {
      const pin = encodeDigipin(lat, lng)!;
      const c = decodeDigipin(pin)!;
      expect(encodeDigipin(c.lat, c.lng)).toBe(pin);
      expect(Math.abs(c.lat - lat)).toBeLessThan(0.0001); // within ~10 m
      expect(Math.abs(c.lng - lng)).toBeLessThan(0.0001);
    }
  });

  it("accepts the ways people type it and rejects anything else", () => {
    expect(normalizeDigipin("4t3-96f-42l7")).toBe("4T396F42L7");
    expect(normalizeDigipin(" 4T3 96F4 2L7 ")).toBe("4T396F42L7");
    expect(normalizeDigipin("4T396F42L")).toBeNull(); // 9 characters
    expect(normalizeDigipin("4T396F42L0")).toBeNull(); // 0 is not a DIGIPIN character
    expect(decodeDigipin("ABCDEFGHIJ")).toBeNull();
    expect(encodeDigipin(51.5, -0.12)).toBeNull(); // outside India
    expect(formatDigipin("4T396F42L7")).toBe("4T3 96F4 2L7");
  });
});
