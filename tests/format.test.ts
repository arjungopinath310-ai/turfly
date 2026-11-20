import { describe, expect, it } from "vitest";
import { rupees } from "@/lib/engine/pricing";
import { formatPhone, plural } from "@/lib/format";

describe("display formats", () => {
  it("rupees: Indian grouping, paise only when needed, minus sign before ₹", () => {
    expect(rupees(150000)).toBe("₹1,500");
    expect(rupees(33200000)).toBe("₹3,32,000");
    expect(rupees(2450)).toBe("₹24.50");
    expect(rupees(-68600)).toBe("−₹686");
    expect(rupees(0)).toBe("₹0");
  });

  it("plural", () => {
    expect(plural(1, "booking")).toBe("1 booking");
    expect(plural(3, "booking")).toBe("3 bookings");
    expect(plural(2, "match", "matches")).toBe("2 matches");
    expect(plural(0, "review")).toBe("0 reviews");
  });

  it("phone numbers read in two groups of five", () => {
    expect(formatPhone("+919876543210")).toBe("+91 98765 43210");
    expect(formatPhone(null)).toBeNull();
  });
});

import { coinsUsable } from "@/lib/coins";
describe("Turf coins at checkout", () => {
  it("whole coins, at most the balance and the amount, never leaving under ₹1 to pay", () => {
    expect(coinsUsable(60, 4900, 100)).toBe(49);
    expect(coinsUsable(11, 4900, 100)).toBe(11);
    expect(coinsUsable(0, 4900, 100)).toBe(0);
    expect(coinsUsable(100, 4950, 100)).toBe(48); // 49 would leave 50 paise, under the gateway minimum
  });
});

import { activityLevel, badgesFor, weekStart } from "@/lib/player-stats";
describe("player profile", () => {
  it("activity level from matches in the last 30 days", () => {
    expect(activityLevel(0).label).toBe("Getting started");
    expect(activityLevel(1).label).toBe("Regular");
    expect(activityLevel(4).label).toBe("Keen");
    expect(activityLevel(12).label).toBe("Turf legend");
  });
  it("weeks start on Monday (IST dates)", () => {
    expect(weekStart("2026-11-20")).toBe("2026-11-16"); // Friday → Monday
    expect(weekStart("2026-11-16")).toBe("2026-11-16"); // Monday
    expect(weekStart("2026-11-22")).toBe("2026-11-16"); // Sunday belongs to the week before
  });
  it("badges: earned at the target; one no-show stops 'Always turns up'", () => {
    const m = (n: number) => Array.from({ length: n }, (_, i) => ({ bookingId: `b${i}`, turfId: `t${i % 2}`, startAt: new Date(), endAt: new Date(), role: "organiser" as const }));
    const base = { hosted: 5, joinedGames: 1, turfs: 2, lateNight: 0, settled: 5 };
    const good = badgesFor({ matches: m(5), noShows: 0, ...base });
    expect(good.find((b) => b.key === "on-time")?.earned).toBe(true);
    expect(good.find((b) => b.key === "host")?.earned).toBe(true);
    expect(good.find((b) => b.key === "team-player")).toMatchObject({ earned: false, progress: 1, target: 3 });
    expect(badgesFor({ matches: m(9), noShows: 1, ...base }).find((b) => b.key === "on-time")?.earned).toBe(false);
  });
});
