import { requireTurfAccess } from "@/lib/auth";
import { resolveRange, turfAnalytics } from "@/lib/analytics";
import { handle } from "@/lib/errors";
import { formatIst } from "@/lib/time";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // quote, and neutralise spreadsheet formula injection (=, +, -, @ at the start)
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Bookings for the selected turf and date range as CSV (opens in Excel / Google Sheets). */
export const GET = handle(async (req) => {
  const u = new URL(req.url);
  const turfId = u.searchParams.get("turf") ?? "";
  const { turf } = await requireTurfAccess(turfId);
  const range = resolveRange({ range: "custom", from: u.searchParams.get("from") ?? undefined, to: u.searchParams.get("to") ?? undefined });
  const a = await turfAnalytics(turf.id, range);
  const head = ["Booking ID", "Match date", "Start", "End", "Pitch", "Source", "Status", "Team / customer", "Booking value (₹)", "Paid online (₹)", "Balance (₹)", "Balance collected", "Booked at"];
  const lines = a.bookingRows.map((b) =>
    [
      b.code,
      formatIst(b.startAt, { dateStyle: "medium" }),
      formatIst(b.startAt, { timeStyle: "short" }),
      formatIst(b.endAt, { timeStyle: "short" }),
      b.config.name,
      b.source,
      b.status,
      b.teamName || b.team?.name || b.user?.name || b.customerName || "",
      ((b.totalPrice - b.discount) / 100).toFixed(2),
      ((b.advanceAmount + b.splitCollected) / 100).toFixed(2), // advance + friends' split shares
      (b.balanceDue / 100).toFixed(2),
      b.balanceCollectedAt ? "yes" : "no",
      formatIst(b.createdAt),
    ].map(cell).join(","),
  );
  const csv = "﻿" + [head.map(cell).join(","), ...lines].join("\r\n");
  const name = `turfly-${turf.slug}-${range.from}-to-${range.to}.csv`;
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });
});
