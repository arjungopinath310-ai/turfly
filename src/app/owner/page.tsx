import Link from "next/link";
import { pageUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAvailability } from "@/lib/engine/booking";
import { rupees } from "@/lib/engine/pricing";
import { manageableTurfs, pickTurf } from "@/lib/owner";
import { formatMinute, formatTimeRange, istParts, istToUtc, todayIst } from "@/lib/time";
import { Stat, StatusBadge } from "@/components/ui";
import { TurfSwitcher } from "@/components/TurfSwitcher";
import { OwnerWelcome } from "@/components/OwnerWelcome";

export default async function OwnerHome(props: { searchParams: Promise<{ turf?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await pageUser("/owner");
  const turfs = await manageableTurfs(user);
  const turf = pickTurf(turfs, searchParams.turf);
  if (!turf) return <OwnerWelcome userId={user.id} name={user.name} />;

  const today = todayIst();
  const dayStart = istToUtc(today, 0);
  const dayEnd = istToUtc(today, 1800);
  const monthStart = istToUtc(today.slice(0, 8) + "01", 0);
  const active = { in: ["CONFIRMED", "COMPLETED"] as ("CONFIRMED" | "COMPLETED")[] };

  const [todays, upcoming, month, cancelled, pending, ledger, recent, avail] = await Promise.all([
    prisma.booking.findMany({ where: { turfId: turf.id, status: active, startAt: { gte: dayStart, lt: dayEnd } }, include: { config: true, team: true, user: { select: { name: true } } }, orderBy: { startAt: "asc" } }),
    prisma.booking.count({ where: { turfId: turf.id, status: "CONFIRMED", startAt: { gte: new Date() } } }),
    prisma.booking.findMany({ where: { turfId: turf.id, status: active, startAt: { gte: monthStart } }, select: { totalPrice: true, discount: true, onlineAmount: true, platformFee: true, splitCollected: true, source: true } }),
    prisma.booking.count({ where: { turfId: turf.id, status: "CANCELLED", startAt: { gte: monthStart } } }),
    prisma.booking.aggregate({ where: { turfId: turf.id, status: active, balanceCollectedAt: null, balanceDue: { gt: 0 } }, _sum: { balanceDue: true }, _count: true }),
    prisma.ledgerEntry.groupBy({ by: ["type"], where: { turfId: turf.id }, _sum: { amount: true } }),
    prisma.booking.findMany({ where: { turfId: turf.id, status: active, startAt: { gte: new Date(Date.now() - 90 * 86400_000) } }, select: { startAt: true } }),
    turf.availabilityMode !== "NONE" ? getAvailability(turf.id, today, 60, { forOwner: false }) : null,
  ]);

  const revenue = month.reduce((a, b) => a + b.totalPrice - b.discount, 0);
  const advances = month.reduce((a, b) => a + b.onlineAmount - b.platformFee + b.splitCollected, 0);
  const freeSlots = avail ? avail.configs.reduce((a, c) => a + c.slots.filter((s) => s.status === "available").length, 0) : 0;
  const cancelRate = month.length + cancelled ? Math.round((cancelled / (month.length + cancelled)) * 100) : 0;
  const owed = ledger.reduce((a, l) => a + (l._sum.amount ?? 0), 0);

  const byHour = new Array(24).fill(0) as number[];
  for (const r of recent) byHour[Math.floor(istParts(r.startAt).minute / 60) % 24]++;
  const maxH = Math.max(1, ...byHour);
  const hours = byHour.map((n, h) => ({ h, n })).filter((x) => x.h >= 5 || x.n > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{turf.name}</h1>
          <div className="mt-1 flex gap-2"><StatusBadge status={turf.status} /><StatusBadge status={turf.availabilityMode} /></div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          {turfs.length > 1 && <TurfSwitcher turfs={turfs} current={turf.id} />}
          <Link href={`/owner/calendar?turf=${turf.id}`} className="btn-primary flex-1 sm:flex-none">Open calendar</Link>
        </div>
      </div>
      {turf.status !== "APPROVED" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          This turf is <b>{turf.status.replace("_", " ").toLowerCase()}</b>. Customers can&apos;t book online until an admin approves it. <Link href={`/owner/turfs/${turf.id}`} className="underline">Complete setup →</Link>
        </div>
      )}

      <div className="card p-4 sm:p-5">
        <h2 className="h2 mb-2">Today&apos;s bookings</h2>
        {todays.length === 0 ? (
          <p className="muted">No bookings today.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {todays.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2.5 text-sm">
                <span>
                  <b>{formatTimeRange(b.startAt, b.endAt)}</b> · {b.config.name}
                  <span className="block text-xs text-slate-500">{b.teamName ?? b.team?.name ?? b.customerName ?? b.user?.name ?? "Customer"} · {b.code} · {b.source.toLowerCase().replace("_", "-")}</span>
                </span>
                <span className="text-right text-xs">{b.balanceCollectedAt ? <span className="text-brand-700">Paid ✓</span> : `${rupees(b.balanceDue)} due`}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Today's bookings" value={todays.length} />
        <Stat label="Upcoming" value={upcoming} />
        <Stat label="Free 1-hr slots today" value={freeSlots} />
        <Stat label="Bookings this month" value={month.length} hint={`${month.filter((m) => m.source !== "ONLINE").length} walk-in / phone`} />
        <Stat label="Booking value this month" value={rupees(revenue)} />
        <Stat label="Advances received" value={rupees(advances)} hint="Collected online by the platform" />
        <Stat label="Pending balances" value={rupees(pending._sum.balanceDue ?? 0)} hint={`${pending._count} bookings`} />
        <Stat label="Cancellations" value={`${cancelled}`} hint={`${cancelRate}% this month`} />
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="card p-5">
          <h2 className="h2 mb-1">Peak booking hours</h2>
          <p className="muted mb-4">Last 90 days, by start time</p>
          <div className="flex h-36 items-end gap-1">
            {hours.map(({ h, n }) => (
              <div key={h} className="flex flex-1 flex-col items-center gap-1" title={`${formatMinute(h * 60)}: ${n}`}>
                <div className="w-full rounded-t bg-brand-500" style={{ height: `${(n / maxH) * 100}%`, minHeight: n ? 4 : 1, opacity: n ? 1 : 0.15 }} />
                {h % 3 === 0 && <span className="text-[9px] text-slate-400">{h}</span>}
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-slate-100 pt-4 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Settlement balance (ledger)</span><b>{rupees(owed)}</b></div>
            {ledger.map((l) => (
              <div key={l.type} className="flex justify-between text-xs text-slate-500"><span>{l.type.replace("_", " ").toLowerCase()}</span><span>{rupees(l._sum.amount ?? 0)}</span></div>
            ))}
            <p className="mt-2 text-[11px] text-slate-400">Commission (if any) is shown here as a separate line. It is never taken silently from the customer&apos;s advance.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
