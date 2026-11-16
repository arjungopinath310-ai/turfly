import { describe, expect, it } from "vitest";
import { daysBetween, hourBuckets, leadBucket, pctChange, previousRange, resolveRange } from "@/lib/analytics";
import { istToUtc, slotRange, shortTime } from "@/lib/time";
import { fmtValue } from "@/lib/chartFormat";

describe("1-hour slot labels", () => {
  it("compact ranges", () => {
    expect(slotRange(18 * 60, 19 * 60)).toBe("6–7 PM");
    expect(slotRange(11 * 60, 12 * 60)).toBe("11 AM–12 PM");
    expect(slotRange(24 * 60, 25 * 60)).toBe("12–1 AM");
    expect(slotRange(18 * 60, 20 * 60)).toBe("6–8 PM");
    expect(shortTime(18 * 60 + 30)).toBe("6:30 PM");
  });
});

describe("analytics helpers", () => {
  it("splits time into IST clock-hour buckets", () => {
    const D = "2026-12-04"; // Friday
    const b = hourBuckets(istToUtc(D, 18 * 60 + 30).getTime(), istToUtc(D, 20 * 60).getTime());
    expect(b).toEqual([
      { weekday: 5, hour: 18, hours: 0.5 },
      { weekday: 5, hour: 19, hours: 1 },
    ]);
    // crossing midnight lands on the next weekday
    const c = hourBuckets(istToUtc(D, 23 * 60).getTime(), istToUtc(D, 25 * 60).getTime());
    expect(c).toEqual([
      { weekday: 5, hour: 23, hours: 1 },
      { weekday: 6, hour: 0, hours: 1 },
    ]);
  });

  it("lead-time buckets", () => {
    const start = new Date("2026-12-10T12:00:00Z");
    expect(leadBucket(new Date("2026-12-10T08:00:00Z"), start)).toBe("Same day");
    expect(leadBucket(new Date("2026-12-08T12:00:00Z"), start)).toBe("1–2 days");
    expect(leadBucket(new Date("2026-12-05T12:00:00Z"), start)).toBe("3–7 days");
    expect(leadBucket(new Date("2026-11-01T12:00:00Z"), start)).toBe("8+ days");
  });

  it("ranges and comparison periods", () => {
    expect(resolveRange({ range: "7d" }, "2026-11-16")).toMatchObject({ from: "2026-11-10", to: "2026-11-16" });
    expect(resolveRange({ range: "last_month" }, "2026-11-16")).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(resolveRange({ range: "custom", from: "2026-11-20", to: "2026-11-01" }, "2026-11-16").key).toBe("30d"); // invalid → default
    expect(previousRange({ from: "2026-11-10", to: "2026-11-16" })).toEqual({ from: "2026-11-03", to: "2026-11-09" });
    expect(daysBetween("2026-11-01", "2026-11-30")).toBe(30);
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(0, 0)).toBe(0);
  });

  it("formats values", () => {
    expect(fmtValue(150000, "rupees")).toBe("₹1,500");
    expect(fmtValue(250000, "rupees", true)).toBe("₹2.5K");
    expect(fmtValue(2000000, "rupees", true)).toBe("₹20K"); // ≥ ₹10K drops the decimal
    expect(fmtValue(25000000, "rupees", true)).toBe("₹2.5L");
    expect(fmtValue(0.456, "percent")).toBe("46%");
    expect(fmtValue(1.5, "hours")).toBe("1.5 h");
    expect(fmtValue(1 / 540, "percent")).toBe("<1%");
  });
});
