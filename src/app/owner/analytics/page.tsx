import Link from "next/link";
import clsx from "clsx";
import { Download, Info, TrendingDown, TrendingUp } from "lucide-react";
import { pageUser } from "@/lib/auth";
import { pctChange, resolveRange, turfAnalytics } from "@/lib/analytics";
import { rupees } from "@/lib/engine/pricing";
import { manageableTurfs, pickTurf } from "@/lib/owner";
import { BarList, ColumnChart, Heatmap, SegmentedBar, TableView } from "@/components/charts";
import { fmtValue } from "@/lib/chartFormat";
import { Empty, StatusBadge } from "@/components/ui";
import { TurfSwitcher } from "@/components/TurfSwitcher";
import { plural } from "@/lib/format";

const PRESETS = [
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["90d", "90 days"],
  ["mtd", "This month"],
  ["last_month", "Last month"],
  ["next30", "Next 30 days"],
] as const;

const shortDate = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const longDate = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

function Kpi({ label, value, cur, prev, upIsGood = true, hint, hero = false }: { label: string; value: string; cur?: number | null; prev?: number | null; upIsGood?: boolean; hint?: string; hero?: boolean }) {
  const ch = cur != null && prev != null && !(cur === 0 && prev === 0) ? pctChange(cur, prev) : undefined;
  const good = ch != null && ch !== 0 ? (ch > 0) === upIsGood : null;
  return (
    <div className={clsx("card min-w-0 p-4", hero && "col-span-2")}>
      <div className="text-xs font-semibold text-[color:var(--viz-ink-2)]">{label}</div>
      <div className={clsx("mt-1 font-semibold tracking-tight text-[color:var(--viz-ink)]", hero ? "text-4xl sm:text-5xl" : "text-2xl")}>{value}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
        {ch === null && <span className="text-[color:var(--viz-muted)]">new vs previous period</span>}
        {ch != null && (
          <span className={clsx("inline-flex items-center gap-0.5 font-medium", good === null ? "text-[color:var(--viz-muted)]" : good ? "text-[color:var(--viz-good)]" : "text-[color:var(--viz-bad)]")}>
            {ch > 0 ? <TrendingUp size={13} /> : ch < 0 ? <TrendingDown size={13} /> : null}
            {ch > 0 ? "+" : ""}{Math.round(ch)}% vs previous period
          </span>
        )}
        {hint && <span className="text-[color:var(--viz-muted)]">{hint}</span>}
      </div>
    </div>
  );
}

export default async function OwnerAnalytics(
  props: { searchParams: Promise<{ turf?: string; range?: string; from?: string; to?: string }> }
) {
  const searchParams = await props.searchParams;
  const user = await pageUser("/owner/analytics");
  const turfs = await manageableTurfs(user);
  const sel = pickTurf(turfs, searchParams.turf);
  if (!sel) return <Empty title="No turf yet"><Link href="/owner/turfs/new" className="underline">Register a turf</Link> to see analytics.</Empty>;
  const range = resolveRange(searchParams);
  const a = await turfAnalytics(sel.id, range);
  const k = a.kpis;
  const p = a.prev;
  const q = (o: Record<string, string>) => `/owner/analytics?${new URLSearchParams({ turf: sel.id, ...o })}`;
  const repeatShare = a.repeat.customers ? a.repeat.repeatCustomers / a.repeat.customers : 0;

  return (
    <div className="viz-root min-w-0 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Analytics</h1>
          <p className="muted">{sel.name} · {range.label} ({longDate(range.from)} – {longDate(range.to)})</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TurfSwitcher turfs={turfs} current={sel.id} />
          <a href={`/api/owner/analytics/export?${new URLSearchParams({ turf: sel.id, from: range.from, to: range.to })}`} className="btn-ghost btn-sm"><Download size={14} /> Export CSV</a>
        </div>
      </div>

      {/* Filters: one row above the charts */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(([key, label]) => (
          <Link key={key} href={q({ range: key })} className={clsx("chip", range.key === key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}>{label}</Link>
        ))}
        <form action="/owner/analytics" className="flex flex-wrap items-center gap-1">
          <input type="hidden" name="turf" value={sel.id} />
          <input type="hidden" name="range" value="custom" />
          <input type="date" name="from" defaultValue={range.from} className="input w-auto py-1 text-xs" aria-label="From" />
          <span className="text-xs text-slate-400">to</span>
          <input type="date" name="to" defaultValue={range.to} className="input w-auto py-1 text-xs" aria-label="To" />
          <button className={clsx("chip", range.key === "custom" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white")}>Apply</button>
        </form>
      </div>

      {sel.status !== "APPROVED" && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">This turf is <StatusBadge status={sel.status} />. Numbers will grow once customers can book online.</div>}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi hero label="Booking value" value={rupees(k.value)} cur={k.value} prev={p.value} hint={`${k.bookings} booking${k.bookings === 1 ? "" : "s"}`} />
        <Kpi label="Utilisation" value={fmtValue(k.utilisation, "percent")} cur={k.utilisation} prev={p.utilisation} hint="of open pitch time" />
        <Kpi label="Booked hours" value={fmtValue(k.bookedHours, "hours")} cur={k.bookedHours} prev={p.bookedHours} />
        <Kpi label="Bookings" value={String(k.bookings)} cur={k.bookings} prev={p.bookings} />
        <Kpi label="Collected online" value={rupees(k.online)} cur={k.online} prev={p.online} />
        <Kpi label="Collected at venue" value={rupees(k.atVenue)} cur={k.atVenue} prev={p.atVenue} />
        <Kpi label="Balance still pending" value={rupees(k.pending)} hint="to collect at the turf" />
        <Kpi label="Cancellation rate" value={fmtValue(k.cancelRate, "percent")} cur={k.cancelRate} prev={p.cancelRate} upIsGood={false} hint={`${k.cancelled} cancelled`} />
        <Kpi label="No-shows" value={String(k.noShows)} cur={k.noShows} prev={p.noShows} upIsGood={false} />
        <Kpi label="Repeat customers" value={fmtValue(repeatShare, "percent")} hint={`${a.repeat.repeatCustomers} of ${a.repeat.customers} online customers`} />
        <Kpi label="Average rating" value={k.avgRating != null ? `${k.avgRating.toFixed(1)} ★` : "–"} hint={plural(a.reviewsCount, "review")} />
      </div>

      {/* Daily value */}
      <section className="card p-5">
        <h2 className="h2">Booking value per day</h2>
        <p className="muted mb-3">By match date. Tap or hover a bar for the day&apos;s bookings.</p>
        <ColumnChart
          ariaLabel="Booking value per day"
          labels={a.daily.map((d) => shortDate(d.date))}
          tooltipLabels={a.daily.map((d) => longDate(d.date))}
          values={a.daily.map((d) => d.value)}
          format="rupees"
          secondary={{ label: "Bookings", values: a.daily.map((d) => d.count), format: "count" }}
        />
        <TableView head={["Date", "Bookings", "Booking value"]} rows={a.daily.filter((d) => d.count).map((d) => [longDate(d.date), d.count, rupees(d.value)])} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Heatmap */}
        <section className="card p-5">
          <h2 className="h2">When is the turf busy?</h2>
          <p className="muted mb-3">Share of open pitch time booked, by weekday and hour. Darker = busier. Use it to set peak prices and offers for quiet hours.</p>
          <Heatmap grid={a.heat} />
        </section>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="h2 mb-3">How bookings arrive</h2>
            <SegmentedBar parts={a.sources.map((s) => ({ label: s.label, value: s.count }))} />
          </section>
          <section className="card p-5">
            <h2 className="h2">How far ahead people book</h2>
            <p className="muted mb-3">Online bookings only</p>
            <BarList rows={a.lead.map((l) => ({ label: l.label, value: l.count }))} format="count" />
          </section>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="h2 mb-3">Booked hours by pitch</h2>
          <BarList rows={a.byPitch.map((r) => ({ label: r.name, value: r.hours, note: `${plural(r.bookings, "booking")} · ${rupees(r.value)}` }))} format="hours" />
          <TableView head={["Pitch", "Bookings", "Hours", "Value"]} rows={a.byPitch.map((r) => [r.name, r.bookings, r.hours, rupees(r.value)])} />
        </section>
        <section className="card p-5">
          <h2 className="h2 mb-3">Top teams & customers</h2>
          {a.top.length === 0 ? (
            <p className="text-sm text-slate-500">No bookings in this period.</p>
          ) : (
            <table className="table" style={{ fontVariantNumeric: "tabular-nums" }}>
              <thead><tr><th>Team / customer</th><th className="text-right">Bookings</th><th className="text-right">Value</th></tr></thead>
              <tbody>{a.top.map((t) => <tr key={t.label}><td>{t.label}</td><td className="text-right">{t.bookings}</td><td className="text-right">{rupees(t.value)}</td></tr>)}</tbody>
            </table>
          )}
        </section>
      </div>

      <p className="flex items-start gap-2 text-xs text-slate-500">
        <Info size={14} className="mt-0.5 shrink-0" />
        Utilisation counts each physical area separately (a full 7-a-side hour uses both halves, so it counts as 2 area-hours) and leaves out time you blocked.
        This period: {a.capacity.areas} areas, {Math.round(a.capacity.openHours)} open area-hours, {Math.round(a.capacity.blockedHours)} blocked, {Math.round(a.capacity.bookedAreaHours)} booked.
        Money is grouped by match date. “Collected at venue” includes walk-in payments taken at the counter and balances you marked as collected.
      </p>
    </div>
  );
}
