import { describe, expect, it } from "vitest";
import { computeSplit } from "@/lib/engine/split";

// ₹1,500 booking, ₹49 advance paid online, ₹1,451 due at the venue
const b = { totalPrice: 150000, discount: 0, advanceAmount: 4900, balanceDue: 145100 };

describe("split payments", () => {
  it("splits into equal whole-rupee shares; the organiser keeps the remainder", () => {
    const r = computeSplit(b, 14);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.shareAmount).toBe(10700); // ₹1,500 / 14 = ₹107.14 → ₹107
    expect(r.friends).toBe(13);
    expect(r.friendsTotal).toBe(139100);
    expect(r.organiserShare).toBe(10900); // includes the rounding
    expect(r.organiserAtVenue).toBe(6000); // ₹109 − ₹49 already paid
    expect(r.friendsTotal + r.organiserShare).toBe(b.totalPrice);
  });

  it("splits the discounted price, not the list price", () => {
    const r = computeSplit({ ...b, discount: 10000, balanceDue: 135100 }, 10);
    expect(r.ok && r.shareAmount).toBe(14000);
  });

  it("never asks friends for more than the balance due", () => {
    // full payment online: nothing left to split
    expect(computeSplit({ ...b, advanceAmount: 150000, balanceDue: 0 }, 2).ok).toBe(false);
    // a big advance means the organiser's share can't cover it with many players
    const big = { totalPrice: 150000, discount: 0, advanceAmount: 50000, balanceDue: 100000 };
    expect(computeSplit(big, 2).ok).toBe(true); // ₹750 each, friends pay ₹750 ≤ ₹1,000
    expect(computeSplit(big, 4).ok).toBe(false); // friends would pay ₹1,125 > ₹1,000 due
  });

  it("rejects too few or too many players and shares under ₹10", () => {
    expect(computeSplit(b, 1).ok).toBe(false);
    expect(computeSplit(b, 31).ok).toBe(false);
    expect(computeSplit(b, 2.5).ok).toBe(false);
    expect(computeSplit({ totalPrice: 5000, discount: 0, advanceAmount: 0, balanceDue: 5000 }, 6).ok).toBe(false);
  });
});
