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
