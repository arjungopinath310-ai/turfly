import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rupees } from "@/lib/engine/pricing";
import { describePolicy, parsePolicy, refundabilityLabel } from "@/lib/engine/policy";
import { formatDateLong, formatTimeRange } from "@/lib/time";
import { mockAllowed } from "@/lib/payments/razorpay";
import { Checkout } from "@/components/Checkout";

export default async function CheckoutPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/checkout/${params.id}`);
  const b = await prisma.booking.findUnique({ where: { id: params.id }, include: { turf: { include: { city: true } }, config: true, team: true } });
  if (!b || b.userId !== user.id) notFound();
  if (b.status === "CONFIRMED") redirect(`/bookings/${b.id}?new=1`);
  const policy = parsePolicy(b.policySnapshot);

  return (
    <div className="mx-auto grid grid-cols-1 max-w-4xl gap-6 px-4 py-10 md:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <h1 className="h1">Complete your reservation</h1>
        <div className="card space-y-1 p-5">
          <div className="text-sm text-slate-500">{b.code}</div>
          <div className="text-lg font-bold">{b.turf.name}</div>
          <div className="text-sm text-slate-600">{b.turf.addressLine}, {b.turf.city.name}</div>
          <div className="pt-2 font-medium">{formatDateLong(b.startAt)} · {formatTimeRange(b.startAt, b.endAt)}</div>
          <div className="text-sm text-slate-600">{b.config.name} · {b.durationMinutes} min{b.team ? ` · Team ${b.teamName ?? b.team.name}` : ""}</div>
        </div>
        <div className="card p-5">
          <h2 className="h2 mb-2">Cancellation & refund: {refundabilityLabel(policy)}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {describePolicy(policy, b.advanceAmount).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="card h-fit space-y-4 p-5">
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-slate-600">Turf booking</dt><dd>{rupees(b.totalPrice)}</dd></div>
          {b.discount > 0 && <div className="flex justify-between text-brand-700"><dt>Discount</dt><dd>− {rupees(b.discount)}</dd></div>}
          <div className="flex justify-between"><dt className="text-slate-600">{b.payFullOnline ? "Paid online" : "Online advance"}</dt><dd>{rupees(b.advanceAmount)}</dd></div>
          {b.platformFee > 0 && <div className="flex justify-between"><dt className="text-slate-600">Platform fee</dt><dd>{rupees(b.platformFee)}</dd></div>}
          <div className="flex justify-between"><dt className="text-slate-600">Balance at venue</dt><dd>{rupees(b.balanceDue)}</dd></div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold"><dt>Pay now</dt><dd>{rupees(b.onlineAmount)}</dd></div>
        </dl>
        <Checkout bookingId={b.id} status={b.status} holdExpiresAt={b.holdExpiresAt?.toISOString() ?? null} mock={mockAllowed()} turfSlug={b.turf.slug} />
        <p className="text-center text-[11px] text-slate-400">UPI · Cards · Net banking · Wallets, processed securely by Razorpay.</p>
      </div>
    </div>
  );
}
