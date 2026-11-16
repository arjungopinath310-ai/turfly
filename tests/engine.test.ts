import { describe, expect, it } from "vitest";
import { convertiblePitchLayout, intervalStatus, type OccupancyRow } from "@/lib/engine/allocation";
import { generateSlots, priceFor } from "@/lib/engine/slots";
import { quote, computeDiscount } from "@/lib/engine/pricing";
import { customerRefund, describePolicy, DEFAULT_POLICY, refundabilityLabel } from "@/lib/engine/policy";
import { istToUtc, istParts, formatMinute } from "@/lib/time";

const D = "2026-12-04"; // a Friday
const t = (min: number) => istToUtc(D, min).getTime();

// Build unit-key → config mapping from the preset
function layout(halvesSimultaneous = true) {
  const l = convertiblePitchLayout({ halvesSimultaneous, allowCombined: true, fullPricePerHour: 200000, halfPricePerHour: 120000 });
  const byName = Object.fromEntries(l.configs.map((c) => [c.name.split(" ")[0] === "Full" ? "FULL" : c.name.includes("A") ? "A" : "B", c.unitKeys]));
  return byName as Record<"FULL" | "A" | "B", string[]>;
}
const occ = (unitKeys: string[], s: number, e: number, kind: OccupancyRow["kind"] = "booked"): OccupancyRow[] =>
  unitKeys.map((u) => ({ unitId: u, start: t(s), end: t(e), kind }));

describe("convertible 7-a-side ↔ 2 × 5-a-side", () => {
  const C = layout();

  it("booking the full pitch blocks both halves", () => {
    const o = occ(C.FULL, 18 * 60, 19 * 60);
    expect(intervalStatus(C.A, t(1080), t(1140), o)).toBe("booked");
    expect(intervalStatus(C.B, t(1080), t(1140), o)).toBe("booked");
  });

  it("booking half A leaves half B free and blocks the full pitch for that interval", () => {
    const o = occ(C.A, 1080, 1140);
    expect(intervalStatus(C.A, t(1080), t(1140), o)).toBe("booked");
    expect(intervalStatus(C.B, t(1080), t(1140), o)).toBeNull();
    expect(intervalStatus(C.FULL, t(1080), t(1140), o)).toBe("booked");
  });

  it("booking half B leaves half A free", () => {
    const o = occ(C.B, 1080, 1140);
    expect(intervalStatus(C.A, t(1080), t(1140), o)).toBeNull();
  });

  it("A 6–7 PM and B 7–8 PM: evaluated per interval, never merged", () => {
    const o = [...occ(C.A, 1080, 1140), ...occ(C.B, 1140, 1200)];
    expect(intervalStatus(C.FULL, t(1080), t(1140), o)).toBe("booked"); // A busy
    expect(intervalStatus(C.FULL, t(1140), t(1200), o)).toBe("booked"); // B busy
    expect(intervalStatus(C.FULL, t(1020), t(1080), o)).toBeNull(); // 5–6 PM free
    expect(intervalStatus(C.FULL, t(1200), t(1260), o)).toBeNull(); // 8–9 PM free
    expect(intervalStatus(C.A, t(1140), t(1200), o)).toBeNull(); // A free 7–8
    expect(intervalStatus(C.B, t(1080), t(1140), o)).toBeNull(); // B free 6–7
  });

  it("back-to-back bookings on the same half do not conflict (half-open ranges)", () => {
    const o = occ(C.A, 1080, 1140);
    expect(intervalStatus(C.A, t(1140), t(1200), o)).toBeNull();
    expect(intervalStatus(C.A, t(1020), t(1080), o)).toBeNull();
  });

  it("a 90-minute request overlapping the end of a booking is blocked", () => {
    const o = occ(C.A, 1080, 1140);
    expect(intervalStatus(C.FULL, t(1110), t(1200), o)).toBe("booked");
  });

  it("both halves booked → full pitch unavailable", () => {
    const o = [...occ(C.A, 1080, 1140), ...occ(C.B, 1080, 1140)];
    expect(intervalStatus(C.FULL, t(1080), t(1140), o)).toBe("booked");
  });

  it("halves not simultaneous: booking A blocks B via the virtual lock", () => {
    const S = layout(false);
    const o = occ(S.A, 1080, 1140);
    expect(intervalStatus(S.B, t(1080), t(1140), o)).toBe("booked");
  });

  it("status priority: booked > blocked > held", () => {
    const o = [...occ(["A"], 1080, 1140, "held"), ...occ(["B"], 1080, 1140, "blocked")];
    expect(intervalStatus(["A", "B"], t(1080), t(1140), o)).toBe("blocked");
    expect(intervalStatus(["A"], t(1080), t(1140), o)).toBe("held");
  });
});

describe("slot generation & pricing", () => {
  const rules = [{ label: "Peak", weekdays: [], startMinute: 18 * 60, endMinute: 23 * 60, pricePerHour: 150000, priority: 1 }];

  it("prorates across peak boundary", () => {
    // 5:30–6:30 PM: 30 min at ₹1,000 + 30 min at ₹1,500 = ₹1,250
    expect(priceFor(D, 1050, 60, 100000, rules).price).toBe(125000);
    expect(priceFor(D, 1080, 90, 100000, rules).price).toBe(225000);
  });

  it("generates slots within hours and marks past/held/booked", () => {
    const now = new Date(istToUtc(D, 6 * 60));
    const slots = generateSlots({
      date: D,
      hours: { isClosed: false, openMinute: 6 * 60, closeMinute: 25 * 60 },
      step: 60,
      duration: 60,
      unitIds: ["A"],
      occupancy: [...occ(["A"], 1080, 1140), ...occ(["A"], 1200, 1260, "held")],
      basePricePerHour: 100000,
      rules,
      now,
      minNoticeMinutes: 30,
    });
    expect(slots[0].status).toBe("unavailable"); // 6 AM, too soon
    expect(slots.at(-1)!.startMinute).toBe(24 * 60); // midnight slot exists (closes 1 AM)
    expect(slots.find((s) => s.startMinute === 1080)!.status).toBe("booked");
    expect(slots.find((s) => s.startMinute === 1200)!.status).toBe("held");
    expect(slots.find((s) => s.startMinute === 1140)!.status).toBe("available");
  });

  it("closed day yields no slots", () => {
    expect(generateSlots({ date: D, hours: { isClosed: true, openMinute: 0, closeMinute: 0 }, step: 30, duration: 60, unitIds: ["A"], occupancy: [], basePricePerHour: 1, rules: [], now: new Date(0), minNoticeMinutes: 0 })).toEqual([]);
  });
});

describe("quote", () => {
  it("₹1,500 slot → ₹49 online, ₹1,451 at venue", () => {
    const q = quote({ totalPrice: 150000, advancePaise: 4900, platformFeePaise: 0, offer: null, payFullOnline: false });
    expect(q).toMatchObject({ advanceAmount: 4900, onlineAmount: 4900, balanceDue: 145100 });
  });
  it("platform fee is a separate line, never taken from the advance", () => {
    const q = quote({ totalPrice: 150000, advancePaise: 4900, platformFeePaise: 1000, offer: null, payFullOnline: false });
    expect(q).toMatchObject({ advanceAmount: 4900, platformFee: 1000, onlineAmount: 5900, balanceDue: 145100 });
  });
  it("discount reduces the venue balance, not the advance", () => {
    const q = quote({ totalPrice: 150000, advancePaise: 4900, platformFeePaise: 0, offer: { discountType: "PERCENT", value: 10, maxDiscountPaise: 10000 }, payFullOnline: false });
    expect(q).toMatchObject({ discount: 10000, advanceAmount: 4900, balanceDue: 135100 });
  });
  it("full online payment", () => {
    expect(quote({ totalPrice: 150000, advancePaise: 4900, platformFeePaise: 0, offer: null, payFullOnline: true }).balanceDue).toBe(0);
  });
  it("discount never exceeds price", () => {
    expect(computeDiscount(5000, { discountType: "FLAT", value: 99999, maxDiscountPaise: null })).toBe(5000);
  });
});

describe("cancellation policy", () => {
  const start = new Date("2026-12-04T13:30:00Z");
  it("tiers", () => {
    expect(customerRefund(DEFAULT_POLICY, 4900, start, new Date(start.getTime() - 30 * 3600_000)).amount).toBe(4900);
    expect(customerRefund(DEFAULT_POLICY, 4900, start, new Date(start.getTime() - 10 * 3600_000)).amount).toBe(2450);
    expect(customerRefund(DEFAULT_POLICY, 4900, start, new Date(start.getTime() - 2 * 3600_000)).amount).toBe(0);
  });
  it("explains outcome in plain words before payment", () => {
    expect(describePolicy(DEFAULT_POLICY, 4900)[0]).toContain("full refund (₹49)");
    expect(refundabilityLabel({ tiers: [], ownerCancelRefundPercent: 100 })).toBe("Non-refundable");
    expect(refundabilityLabel(DEFAULT_POLICY)).toBe("Refundable");
  });
});

describe("time", () => {
  it("IST conversions", () => {
    expect(istToUtc(D, 18 * 60).toISOString()).toBe("2026-12-04T12:30:00.000Z");
    expect(istParts(new Date("2026-12-04T12:30:00Z"))).toMatchObject({ date: D, minute: 1080, weekday: 5 });
    expect(formatMinute(1500)).toBe("1:00 AM");
  });
});
