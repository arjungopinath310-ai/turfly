import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rupees } from "@/lib/engine/pricing";
import { describePolicy, parsePolicy, refundabilityLabel } from "@/lib/engine/policy";
import { formatDateLong, formatTimeRange } from "@/lib/time";
import { mockAllowed } from "@/lib/payments/razorpay";
import { Checkout } from "@/components/Checkout";

/** Phones: what you're booking → what you pay (with the Pay button on the first screen) → refund rules. */
export default async function CheckoutPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/checkout/${params.id}`);
  const b = await prisma.booking.findUnique({ where: { id: params.id }, include: { turf: { include: { city: true } }, config: true, team: true } });
  if (!b || b.userId !== user.id) notFound();
  if (b.status === "CONFIRMED") redirect(`/bookings/${b.id}?new=1`);
  const policy = parsePolicy(b.policySnapshot);

  return (
    <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 px-4 py-5 sm:gap-6 sm:py-10 md:grid-cols-[1fr_360px]">
      <div className="space-y-4 md:col-start-1 md:row-start-1">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Confirm & pay</h1>
        <div className="card space-y-1 p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">Booking {b.code}</div>
          <div className="text-lg font-bold leading-tight">{b.turf.name}</div>
          <div className="text-sm text-slate-600">{b.turf.addressLine}, {b.turf.city.name}</div>
          <div className="pt-2 font-semibold">{formatDateLong(b.startAt)} · {formatTimeRange(b.startAt, b.endAt)}</div>
          <div className="text-sm text-slate-600">{b.config.name} · {b.durationMinutes} min{b.team ? ` · Team ${b.teamName ?? b.team.name}` : ""}</div>
        </div>
      </div>
      <div className="card h-fit space-y-4 p-4 sm:p-5 md:col-start-2 md:row-span-2 md:row-start-1 md:sticky md:top-20">
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-slate-600">Turf price</dt><dd>{rupees(b.totalPrice)}</dd></div>
          {b.discount > 0 && <div className="flex justify-between text-brand-700"><dt>Discount</dt><dd>− {rupees(b.discount)}</dd></div>}
          <div className="flex justify-between"><dt className="text-slate-600">{b.payFullOnline ? "Paid online" : "Advance (online)"}</dt><dd>{rupees(b.advanceAmount)}</dd></div>
          {b.platformFee > 0 && <div className="flex justify-between"><dt className="text-slate-600">Platform fee</dt><dd>{rupees(b.platformFee)}</dd></div>}
          <div className="flex justify-between"><dt className="text-slate-600">Pay at the turf</dt><dd>{rupees(b.balanceDue)}</dd></div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold"><dt>Pay now</dt><dd>{rupees(b.onlineAmount)}</dd></div>
        </dl>
        <Checkout bookingId={b.id} status={b.status} holdExpiresAt={b.holdExpiresAt?.toISOString() ?? null} mock={mockAllowed()} turfSlug={b.turf.slug} />
        <p className="text-center text-[11px] text-slate-400">UPI · Cards · Net banking · Wallets, processed securely by Razorpay.</p>
      </div>
      <details className="card p-4 sm:p-5 md:col-start-1 md:row-start-2" open>
        <summary className="cursor-pointer font-semibold">Cancellation & refund: {refundabilityLabel(policy)}</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {describePolicy(policy, b.advanceAmount).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
