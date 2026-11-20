import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CheckCircle2, MapPin, Navigation, Users } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { rupees } from "@/lib/engine/pricing";
import { AppError } from "@/lib/errors";
import { directionsUrl } from "@/lib/share";
import { loadSplit, splitOpen } from "@/lib/split";
import { formatDateLong, formatTimeRange } from "@/lib/time";
import { SharePay } from "@/components/SharePay";

export const metadata: Metadata = { title: "Pay your share", robots: { index: false } };

export default async function SplitPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const plan = await loadSplit(token).catch((e) => {
    if (e instanceof AppError && e.status === 404) return null;
    throw e;
  });
  if (!plan) notFound();
  const user = await currentUser();
  const b = plan.booking;
  const friends = plan.players - 1;
  const paid = plan.shares.filter((s) => s.status === "PAID");
  const mine = user ? plan.shares.find((s) => s.paidById === user.id) : undefined;
  const isOrganiser = Boolean(user && b.userId === user.id);
  const open = splitOpen(plan);
  const allPaid = paid.length >= friends;
  const firstName = b.user?.name?.split(" ")[0];
  const organiser = firstName || "Your friend";

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="card overflow-hidden">
        <div className="pitch-bg border-b-4 border-volt p-6 text-white">
          <div className="kicker text-volt">{organiser} is splitting the cost</div>
          <div className="score mt-1 text-5xl leading-none">{rupees(plan.shareAmount)} <span className="font-display text-base font-semibold uppercase tracking-[.06em] text-slate-300">per player</span></div>
          <div className="mt-2 text-sm text-slate-300">{paid.length} of {friends} shares paid so far</div>
        </div>
        <div className="space-y-4 p-6">
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2"><MapPin size={16} className="mt-0.5 shrink-0 text-slate-400" /><div><div className="font-semibold">{b.turf.name}</div><div className="text-slate-600">{b.turf.addressLine}</div></div></div>
            <div className="flex items-center gap-2"><CalendarDays size={16} className="text-slate-400" />{formatDateLong(b.startAt)} · {formatTimeRange(b.startAt, b.endAt)}</div>
            <div className="flex items-center gap-2"><Users size={16} className="text-slate-400" />{b.config.name} · booking {b.code}</div>
          </div>

          {isOrganiser ? (
            <div className="rounded-xl bg-slate-50 p-4 text-sm">
              This is your split. Your share is paid at the venue.
              <Link href={`/bookings/${b.id}`} className="btn-ghost btn-sm mt-3 w-full">Manage it from your booking</Link>
            </div>
          ) : mine?.status === "PAID" ? (
            <div className="rounded-xl bg-brand-50 p-4 text-brand-900">
              <div className="flex items-center gap-2 font-semibold"><CheckCircle2 size={18} /> You&apos;ve paid your share of {rupees(plan.shareAmount)}</div>
              <p className="mt-1 text-sm">You&apos;re on the squad. If the booking is cancelled, your share is refunded in full.</p>
              <a className="btn-ghost btn-sm mt-3" href={directionsUrl(b.turf)} target="_blank" rel="noreferrer"><Navigation size={14} /> Directions</a>
            </div>
          ) : mine?.status === "REFUNDED" ? (
            <p className="rounded-xl bg-sky-50 p-4 text-sm text-sky-800">Your share was refunded in full.</p>
          ) : !open ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
              {b.status === "CANCELLED" ? "This booking was cancelled." : plan.cancelledAt ? "The organiser stopped this split." : "This split is closed for payments."}
            </p>
          ) : allPaid ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">Every share has been paid. Nothing more to pay here.</p>
          ) : !user ? (
            <Link href={`/login?next=/split/${token}`} className="btn-primary w-full py-3 text-base">Sign in to pay {rupees(plan.shareAmount)}</Link>
          ) : (
            <SharePay token={token} amountLabel={rupees(plan.shareAmount)} />
          )}

          {user && paid.length > 0 && (
            <div>
              <div className="label">Paid so far</div>
              <div className="flex flex-wrap gap-1.5">
                {paid.map((s) => <span key={s.seq} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800">{s.paidBy?.name?.split(" ")[0] ?? "Player"}</span>)}
              </div>
            </div>
          )}
          <p className="text-xs text-slate-500">
            Payments go securely through Razorpay (UPI, cards, net banking). Your share is taken off what {firstName || "the organiser"} pays at the venue.
            If the booking is cancelled, every share is refunded in full.
          </p>
        </div>
      </div>
    </div>
  );
}
