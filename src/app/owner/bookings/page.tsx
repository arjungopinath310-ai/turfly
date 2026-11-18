import Link from "next/link";
import { pageUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rupees } from "@/lib/engine/pricing";
import { manageableTurfs, pickTurf } from "@/lib/owner";
import { formatDateLong, formatTimeRange, todayIst } from "@/lib/time";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { Empty, StatusBadge } from "@/components/ui";
import { spotsLabel } from "@/lib/games-shared";
import { formatPhone } from "@/lib/format";
import { TurfSwitcher } from "@/components/TurfSwitcher";
import { MessageButton } from "@/components/MessageButton";
import { collectBalance, markNoShow, ownerCancel, ownerReschedule } from "../actions";

export default async function OwnerBookings(
  props: { searchParams: Promise<{ turf?: string; tab?: string; focus?: string; q?: string }> }
) {
  const searchParams = await props.searchParams;
  const user = await pageUser("/owner/bookings");
  const turfs = await manageableTurfs(user);
  const sel = pickTurf(turfs, searchParams.turf);
  if (!sel) return <Empty title="No turf yet" />;
  const tab = searchParams.tab ?? "upcoming";
  const now = new Date();
  const where =
    tab === "upcoming" ? { status: { in: ["CONFIRMED" as const] }, endAt: { gte: now } }
    : tab === "balance" ? { status: { in: ["CONFIRMED" as const, "COMPLETED" as const] }, balanceDue: { gt: 0 }, balanceCollectedAt: null }
    : tab === "cancelled" ? { status: { in: ["CANCELLED" as const] } }
    : { endAt: { lt: now }, status: { in: ["CONFIRMED" as const, "COMPLETED" as const, "NO_SHOW" as const] } };
  const [bookings, configs] = await Promise.all([
    prisma.booking.findMany({
      where: { turfId: sel.id, ...where, ...(searchParams.focus ? { id: searchParams.focus } : {}), ...(searchParams.q ? { OR: [{ code: { contains: searchParams.q, mode: "insensitive" as const } }, { customerName: { contains: searchParams.q, mode: "insensitive" as const } }, { teamName: { contains: searchParams.q, mode: "insensitive" as const } }] } : {}) },
      include: {
        config: true,
        team: true,
        user: { select: { name: true, phone: true } },
        roster: true,
        payments: true,
        // Players short for this booking who listed it as an open game
        posts: { where: { status: { in: ["OPEN", "FILLED"] } }, select: { playersNeeded: true, _count: { select: { requests: { where: { status: "ACCEPTED" } } } } } },
      },
      orderBy: { startAt: tab === "upcoming" ? "asc" : "desc" },
      take: 100,
    }),
    prisma.pitchConfig.findMany({ where: { turfId: sel.id, isActive: true } }),
  ]);
  const tabs = [["upcoming", "Upcoming"], ["balance", "Balance pending"], ["past", "Past"], ["cancelled", "Cancelled"]];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="h1 mr-auto">Bookings</h1>
        <TurfSwitcher turfs={turfs} current={sel.id} />
        <form className="flex gap-1">
          <input type="hidden" name="turf" value={sel.id} />
          <input type="hidden" name="tab" value={tab} />
          <input name="q" defaultValue={searchParams.q} placeholder="Booking ID / name" className="input py-1.5" />
        </form>
      </div>
      <div className="flex gap-1">
        {tabs.map(([k, l]) => (
          <Link key={k} href={`/owner/bookings?turf=${sel.id}&tab=${k}`} className={`chip ${tab === k && !searchParams.focus ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}>{l}</Link>
        ))}
      </div>
      {bookings.length === 0 && <Empty title="Nothing here" />}
      <div className="space-y-3">
        {bookings.map((b) => (
          <div key={b.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">{b.code}</span>
                  <StatusBadge status={b.status} />
                  <span className="chip border-slate-200 text-slate-500">{b.source.toLowerCase().replace("_", "-")}</span>
                  {b.posts[0] && (
                    <span className="chip border-amber-200 bg-amber-50 text-amber-800" title="The organiser is finding extra players through Turfly">
                      Open game · {spotsLabel(b.posts[0].playersNeeded - b.posts[0]._count.requests).toLowerCase()}
                    </span>
                  )}
                </div>
                <div className="mt-1 font-semibold">{formatDateLong(b.startAt)} · {formatTimeRange(b.startAt, b.endAt)} · {b.config.name}</div>
                <div className="text-sm text-slate-600">
                  {b.teamName || b.team?.name || "No team"} · organiser {b.customerName || b.user?.name || "—"}
                  {(b.customerPhone ?? b.user?.phone) && <> · <a className="underline" href={`tel:${b.customerPhone ?? b.user?.phone}`}>{formatPhone(b.customerPhone ?? b.user?.phone)}</a></>}
                </div>
                {b.roster.length > 0 && <div className="mt-1 text-xs text-slate-500">Squad: {b.roster.filter((r) => r.status !== "DECLINED").map((r) => r.name + (r.isCaptain ? " (C)" : "")).join(", ")}</div>}
              </div>
              <div className="text-right text-sm">
                <div>Total {rupees(b.totalPrice - b.discount)}</div>
                <div className="text-slate-500">Online {rupees(b.onlineAmount - b.platformFee + b.splitCollected)}{b.splitCollected > 0 ? " (incl. split)" : ""}</div>
                <div className={b.balanceCollectedAt ? "text-brand-700" : "font-semibold"}>{b.balanceCollectedAt ? "Balance collected ✓" : `Due ${rupees(b.balanceDue)}`}</div>
              </div>
            </div>
            {["CONFIRMED", "COMPLETED"].includes(b.status) && (
              <div className="mt-4 flex flex-wrap items-start gap-2 border-t border-slate-100 pt-4">
                {b.userId && <MessageButton turfId={b.turfId} playerId={b.userId} bookingId={b.id} label="Message customer" />}
                {!b.balanceCollectedAt && b.balanceDue > 0 && <ActionButton action={collectBalance.bind(null, b.id)} label={`Mark ${rupees(b.balanceDue)} collected`} className="btn-primary btn-sm" />}
                {b.status === "CONFIRMED" && b.startAt < now && <ActionButton action={markNoShow.bind(null, b.id)} label="No-show" confirmText="Mark as no-show?" />}
                {b.status === "CONFIRMED" && b.startAt > now && (
                  <>
                    <details className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm">
                      <summary className="cursor-pointer font-medium">Reschedule</summary>
                      <ActionForm action={ownerReschedule} className="mt-2 flex flex-wrap gap-2" submit="Move" submitClass="btn-dark btn-sm">
                        <input type="hidden" name="bookingId" value={b.id} />
                        <select name="configId" defaultValue={b.configId} className="input py-1.5">{configs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                        <input type="date" name="date" defaultValue={todayIst()} className="input py-1.5" />
                        <input type="time" name="start" defaultValue="18:00" className="input py-1.5" />
                      </ActionForm>
                    </details>
                    <details className="rounded-xl border border-red-200 px-3 py-1.5 text-sm">
                      <summary className="cursor-pointer font-medium text-red-600">Cancel & refund</summary>
                      <ActionForm action={ownerCancel} className="mt-2 flex flex-wrap gap-2" submit="Cancel booking" submitClass="btn-danger btn-sm">
                        <input type="hidden" name="bookingId" value={b.id} />
                        <input name="reason" placeholder="Reason shown to customer" className="input py-1.5" />
                      </ActionForm>
                      <p className="mt-1 text-[11px] text-slate-500">Turf-initiated cancellations refund 100% of the online payment.</p>
                    </details>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
