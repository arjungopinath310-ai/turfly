import { describe, expect, it } from "vitest";
import { dayWord, maxPlayersNeeded, spotsLabel, spotsLeft, suggestShare, whatsappLink } from "@/lib/games-shared";
import { istToUtc } from "@/lib/time";

describe("open games rules", () => {
  it("players needed: at most everyone on the pitch except the organiser", () => {
    expect(maxPlayersNeeded(5)).toBe(9);
    expect(maxPlayersNeeded(7)).toBe(13);
    expect(maxPlayersNeeded(11)).toBe(21);
    expect(maxPlayersNeeded(0)).toBe(1);
  });

  it("suggested share: turf price over all players, rounded to ₹10", () => {
    expect(suggestShare(120000, 5)).toBe(12000); // ₹1,200 / 10 = ₹120
    expect(suggestShare(150000, 7)).toBe(11000); // ₹1,500 / 14 = ₹107 → ₹110
    expect(suggestShare(0, 5)).toBe(0);
  });

  it("spots left and labels", () => {
    expect(spotsLeft(3, 1)).toBe(2);
    expect(spotsLeft(2, 5)).toBe(0);
    expect(spotsLabel(1)).toBe("1 spot left");
    expect(spotsLabel(3)).toBe("3 spots left");
    expect(spotsLabel(0)).toBe("Full");
  });

  it("day words in India time", () => {
    const now = istToUtc("2026-11-18", 9 * 60);
    expect(dayWord(istToUtc("2026-11-18", 23 * 60 + 30), now)).toBe("Today");
    expect(dayWord(istToUtc("2026-11-19", 30), now)).toBe("Tomorrow");
    expect(dayWord(istToUtc("2026-11-21", 19 * 60), now)).toMatch(/Sat.*21.*Nov/);
  });

  it("WhatsApp links use digits only", () => {
    expect(whatsappLink("+919876543210")).toBe("https://wa.me/919876543210");
    expect(whatsappLink("+919876543210", "Hi there")).toBe("https://wa.me/919876543210?text=Hi%20there");
  });
});
