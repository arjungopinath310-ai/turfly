import Link from "next/link";
import clsx from "clsx";
import { pageUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAvailability, releaseExpiredHolds } from "@/lib/engine/booking";
import { manageableTurfs, pickTurf } from "@/lib/owner";
import { addDays, formatTimeRange, istParts, istToUtc, isValidDate, todayIst, weekdayOf } from "@/lib/time";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { Empty } from "@/components/ui";
import { TurfSwitcher } from "@/components/TurfSwitcher";
import { SlotChart } from "@/components/SlotChart";
import { blockFromChart, blockSlot, unblock, walkIn } from "../actions";

export default async function OwnerCalendar(
  props: { searchParams: Promise<{ turf?: string; date?: string; view?: string; config?: string; start?: string; dur?: string }> }
) {
  const searchParams = await props.searchParams;
  const user = await pageUser("/owner/calendar");
  const turfs = await manageableTurfs(user);
  const sel = pickTurf(turfs, searchParams.turf);
  if (!sel) return <Empty title="No turf yet"><Link href="/owner/turfs/new" className="underline">Register a turf</Link></Empty>;
  const date = searchParams.date && isValidDate(searchParams.date) ? searchParams.date : todayIst();
  const view = searchParams.view ?? "day";
  await releaseExpiredHolds();
  const turf = await prisma.turf.findUniqueOrThrow({ where: { id: sel.id }, include: { configs: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } } });
  const q = (o: Record<string, string>) => `/owner/calendar?${new URLSearchParams({ turf: turf.id, date, view, ...o })}`;
  const shift = view === "month" ? 30 : view === "week" ? 7 : 1;
  // A walk-in started from the chart arrives with the pitch, time and length filled in
  const pre = {
    config: turf.configs.some((c) => c.id === searchParams.config) ? searchParams.config! : turf.configs[0]?.id,
    start: /^\d{2}:\d{2}$/.test(searchParams.start ?? "") ? searchParams.start! : "18:00",
    dur: turf.allowedDurations.includes(Number(searchParams.dur)) ? Number(searchParams.dur) : turf.allowedDurations[0],
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="h1 mr-auto">Calendar</h1>
        {/* On phones the forms are below the grid: jump straight to them */}
        <div className="flex w-full gap-2 sm:w-auto lg:hidden">
          <a href="#walkin" className="btn-primary btn-sm flex-1 sm:flex-none">+ Walk-in booking</a>
          <a href="#block" className="btn-ghost btn-sm flex-1 sm:flex-none">Block time</a>
        </div>
        <TurfSwitcher turfs={turfs} current={turf.id} />
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-sm">
          {["day", "week", "month"].map((v) => (
            <Link key={v} href={q({ view: v })} className={clsx("rounded-lg px-3 py-1.5 font-medium capitalize", v === view ? "bg-slate-900 text-white" : "text-slate-600")}>{v}</Link>
          ))}
        </div>
        <Link href={q({ date: addDays(date, -shift) })} className="btn-ghost btn-sm">←</Link>
        <form action="/owner/calendar" className="flex gap-1">
          <input type="hidden" name="turf" value={turf.id} />
          <input type="hidden" name="view" value={view} />
          <input type="date" name="date" defaultValue={date} className="input py-1.5" />
          <button className="btn-ghost btn-sm">Go</button>
        </form>
        <Link href={q({ date: addDays(date, shift) })} className="btn-ghost btn-sm">→</Link>
      </div>

      {view === "day" && <DayView turfId={turf.id} date={date} step={turf.slotStepMinutes} />}
      {view !== "day" && <p className="text-xs text-slate-500">To block or free up slots, open a day (tap a date) and tap the slots on its chart.</p>}
      {view === "week" && <RangeView turfId={turf.id} from={date} days={7} configs={turf.configs} q={q} />}
      {view === "month" && <MonthView turfId={turf.id} date={date} q={q} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div id="walkin" className="card scroll-mt-20 p-5">
          <h2 className="h2 mb-3">Walk-in / phone booking</h2>
          <ActionForm key={`${date}-${pre.config}-${pre.start}-${pre.dur}`} action={walkIn} className="grid grid-cols-1 gap-2 sm:grid-cols-2" submit="Create booking" submitClass="btn-primary sm:col-span-2">
            <input type="hidden" name="turfId" value={turf.id} />
            <select name="configId" defaultValue={pre.config} className="input sm:col-span-2" aria-label="Pitch">{turf.configs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <label className="field-label">Date<input type="date" name="date" defaultValue={date} className="input mt-1" /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="field-label">Start<input type="time" name="start" step={turf.slotStepMinutes * 60} defaultValue={pre.start} className="input mt-1" /></label>
              <label className="field-label">Length<select name="duration" defaultValue={pre.dur} className="input mt-1">{turf.allowedDurations.map((d) => <option key={d} value={d}>{d % 60 ? `${d} min` : `${d / 60} hr`}</option>)}</select></label>
            </div>
            <input name="customerName" placeholder="Customer name *" className="input" />
            <input name="customerPhone" placeholder="Phone (optional)" className="input" />
            <input name="teamName" placeholder="Team name (optional)" className="input" />
            <div className="grid grid-cols-2 gap-2">
              <select name="source" className="input"><option value="WALK_IN">Walk-in</option><option value="PHONE">Phone</option></select>
              <input name="collected" type="number" min={0} placeholder="₹ collected" className="input" />
            </div>
            <p className="text-[11px] text-slate-500 sm:col-span-2">Saved instantly and blocks the slot online. The database rejects it if the slot (or a conflicting pitch) is already taken.</p>
          </ActionForm>
        </div>
        <div id="block" className="card scroll-mt-20 p-5">
          <h2 className="h2">Block time</h2>
          <p className="mb-3 mt-1 text-xs text-slate-500">For longer closures: maintenance, a private event or a holiday. To block a slot or two, tap it on the day chart above.</p>
          <ActionForm action={blockSlot} className="grid grid-cols-1 gap-2 sm:grid-cols-2" submit="Block" submitClass="btn-dark sm:col-span-2">
            <input type="hidden" name="turfId" value={turf.id} />
            <select name="configId" className="input sm:col-span-2" aria-label="What to block">
              <option value="ALL">Entire turf (all pitches)</option>
              {turf.configs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label className="field-label">From date<input type="date" name="date" defaultValue={date} className="input mt-1" /></label>
            <label className="field-label">To date <span className="font-normal text-slate-400">(optional, for several days)</span><input type="date" name="endDate" className="input mt-1" /></label>
            <label className="field-label">From time<input type="time" name="start" defaultValue="06:00" className="input mt-1" /></label>
            <label className="field-label">To time<input type="time" name="end" defaultValue="23:59" className="input mt-1" /></label>
            <select name="reason" className="input" aria-label="Reason"><option value="MAINTENANCE">Maintenance</option><option value="PRIVATE_EVENT">Private event</option><option value="HOLIDAY">Holiday</option><option value="OTHER">Other</option></select>
            <input name="note" placeholder="Note (internal)" className="input" />
          </ActionForm>
        </div>
      </div>
    </div>
  );
}

async function DayView({ turfId, date, step }: { turfId: string; date: string; step: number }) {
  const a = await getAvailability(turfId, date, step, { forOwner: true });
  const [bookings, blocks] = await Promise.all([
    prisma.booking.findMany({
      where: { turfId, status: { in: ["CONFIRMED", "COMPLETED", "HELD", "NO_SHOW"] }, startAt: { lt: istToUtc(date, 1800) }, endAt: { gt: istToUtc(date, 0) } },
      include: { config: true, team: true, user: { select: { name: true } } },
      orderBy: { startAt: "asc" },
    }),
    prisma.slotBlock.findMany({ where: { turfId, startAt: { lt: istToUtc(date, 1800) }, endAt: { gt: istToUtc(date, 0) } }, include: { config: true } }),
  ]);
  const dayStart = istToUtc(date, 0).getTime();
  const rel = (d: Date) => Math.round((d.getTime() - dayStart) / 60000);
  const configName = (id: string | null) => (id ? a.configs.find((c) => c.id === id)?.name ?? "Pitch" : "Entire turf");
  const chartBookings = bookings
    .filter((b) => b.status !== "NO_SHOW")
    .map((b) => ({ id: b.id, code: b.code, configId: b.configId, configName: b.config.name, start: Math.max(0, rel(b.startAt)), end: Math.min(1800, rel(b.endAt)), who: b.teamName || b.team?.name || b.customerName || b.user?.name || "Customer", held: b.status === "HELD" }));
  const chartBlocks = blocks.map((bl) => ({
    id: bl.id, configId: bl.configId, configName: configName(bl.configId), start: Math.max(0, rel(bl.startAt)), end: Math.min(1800, rel(bl.endAt)), reason: bl.reason, note: bl.note,
    until: istParts(bl.endAt).date !== istParts(bl.startAt).date ? istParts(bl.endAt).date : null,
  }));
  if (!a.hours || a.hours.isClosed) return <div className="card p-6 text-sm text-slate-500">Closed on {date} (weekday {weekdayOf(date)}). Change operating hours in turf settings.</div>;
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr_1fr]">
      <div className="card p-4 sm:p-5">
        <SlotChart
          turfId={turfId}
          date={date}
          step={step}
          rows={a.configs.map((c) => ({ id: c.id, name: c.name, slots: c.slots.map((s) => ({ startMinute: s.startMinute, status: s.status })) }))}
          bookings={chartBookings}
          blocks={chartBlocks}
          onBlock={blockFromChart.bind(null, turfId)}
          onUnblock={unblock.bind(null, turfId)}
        />
      </div>
      <div className="card p-5">
        <h2 className="h2 mb-3">Bookings & blocks</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {bookings.map((b) => (
            <li key={b.id} className="py-2">
              <div className="flex justify-between">
                <b>{formatTimeRange(b.startAt, b.endAt)}</b>
                <span className={clsx("text-xs", b.status === "HELD" ? "text-amber-600" : "text-slate-500")}>{b.status === "HELD" ? "in checkout" : b.source.toLowerCase().replace("_", "-")}</span>
              </div>
              <div className="text-xs text-slate-500">{b.config.name} · {b.teamName || b.team?.name || b.customerName || b.user?.name || "Customer"} · <Link className="underline" href={`/owner/bookings?focus=${b.id}`}>{b.code}</Link></div>
            </li>
          ))}
          {blocks.map((bl) => (
            <li key={bl.id} className="flex items-center justify-between py-2">
              <span>
                <b>{formatTimeRange(bl.startAt, bl.endAt)}</b>{istParts(bl.endAt).date !== istParts(bl.startAt).date ? ` (until ${istParts(bl.endAt).date})` : ""}
                <span className="block text-xs text-slate-500">Blocked · {bl.config?.name ?? "Entire turf"} · {bl.reason.toLowerCase().replace("_", " ")}{bl.note ? ` · ${bl.note}` : ""}</span>
              </span>
              <ActionButton action={unblock.bind(null, turfId, bl.id)} label="Unblock" />
            </li>
          ))}
          {bookings.length + blocks.length === 0 && <li className="py-2 text-slate-500">Nothing scheduled.</li>}
        </ul>
      </div>
    </div>
  );
}

async function RangeView({ turfId, from, days, configs, q }: { turfId: string; from: string; days: number; configs: { id: string; name: string }[]; q: (o: Record<string, string>) => string }) {
  const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
  const bookings = await prisma.booking.findMany({
    where: { turfId, status: { in: ["CONFIRMED", "COMPLETED"] }, startAt: { gte: istToUtc(from, 0), lt: istToUtc(addDays(from, days), 0) } },
    include: { team: true },
    orderBy: { startAt: "asc" },
  });
  return (
    <div className="card overflow-x-auto p-5">
      <table className="table min-w-[800px]">
        <thead>
          <tr>
            <th />
            {dates.map((d) => (
              <th key={d}><Link href={q({ view: "day", date: d })} className="hover:underline">{new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</Link></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {configs.map((c) => (
            <tr key={c.id}>
              <td className="font-semibold">{c.name}</td>
              {dates.map((d) => {
                const list = bookings.filter((b) => b.configId === c.id && istParts(b.startAt).date === d);
                return (
                  <td key={d} className="space-y-1">
                    {list.map((b) => (
                      <div key={b.id} className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-800">{formatTimeRange(b.startAt, b.endAt)}<span className="block truncate text-red-600/70">{b.teamName || b.team?.name || b.customerName || ""}</span></div>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function MonthView({ turfId, date, q }: { turfId: string; date: string; q: (o: Record<string, string>) => string }) {
  const first = date.slice(0, 8) + "01";
  const startPad = weekdayOf(first);
  const [y, m] = first.split("-").map(Number);
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const bookings = await prisma.booking.findMany({
    where: { turfId, status: { in: ["CONFIRMED", "COMPLETED"] }, startAt: { gte: istToUtc(first, 0), lt: istToUtc(addDays(first, daysIn), 0) } },
    select: { startAt: true },
  });
  const blocks = await prisma.slotBlock.findMany({ where: { turfId, startAt: { lt: istToUtc(addDays(first, daysIn), 0) }, endAt: { gt: istToUtc(first, 0) } }, select: { startAt: true, endAt: true } });
  const count: Record<string, number> = {};
  for (const b of bookings) count[istParts(b.startAt).date] = (count[istParts(b.startAt).date] ?? 0) + 1;
  const max = Math.max(1, ...Object.values(count));
  return (
    <div className="card p-5">
      <div className="mb-3 font-semibold">{new Date(first + "T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="text-slate-400">{d}</div>)}
        {Array.from({ length: startPad }, (_, i) => <div key={`p${i}`} />)}
        {Array.from({ length: daysIn }, (_, i) => {
          const d = addDays(first, i);
          const n = count[d] ?? 0;
          const blocked = blocks.some((b) => b.startAt <= istToUtc(d, 720) && b.endAt >= istToUtc(d, 720));
          return (
            <Link key={d} href={q({ view: "day", date: d })} className={clsx("rounded-xl border p-2 hover:border-slate-400", blocked ? "border-slate-300 bg-slate-100" : "border-slate-200")} style={n ? { backgroundColor: `rgba(3,152,85,${0.12 + (n / max) * 0.5})` } : undefined}>
              <div className="font-semibold">{i + 1}</div>
              <div className="text-[10px] text-slate-600">{n ? `${n} booking${n > 1 ? "s" : ""}` : blocked ? "blocked" : " "}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
