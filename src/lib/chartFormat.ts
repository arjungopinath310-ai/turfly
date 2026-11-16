/** Number formatting shared by server pages and client charts. */
export type Fmt = "rupees" | "count" | "hours" | "percent";

export function fmtValue(v: number, f: Fmt, compact = false): string {
  if (f === "rupees") {
    const r = v / 100;
    if (compact && r >= 100000) return `₹${(r / 100000).toFixed(r >= 1000000 ? 0 : 1)}L`;
    if (compact && r >= 1000) return `₹${(r / 1000).toFixed(r >= 10000 ? 0 : 1)}K`;
    return "₹" + Math.round(r).toLocaleString("en-IN");
  }
  if (f === "percent") return v > 0 && v < 0.005 ? "<1%" : `${Math.round(v * 100)}%`;
  if (f === "hours") return `${Number.isInteger(v) ? v : v.toFixed(1)} h`;
  return Math.round(v).toLocaleString("en-IN");
}

