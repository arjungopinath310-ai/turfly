import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rupees } from "@/lib/engine/pricing";
import { formatDateLong, formatIst, formatTimeRange } from "@/lib/time";
import { PrintButton } from "@/components/PrintButton";

export default async function ReceiptPage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const b = await prisma.booking.findUnique({
    where: { id: params.id },
    include: { turf: { include: { city: true } }, config: true, payments: { where: { status: { not: "CREATED" } }, include: { refunds: true } } },
  });
  if (!b || b.userId !== user.id) notFound();
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <div className="card space-y-5 p-8 print:shadow-none">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xl font-extrabold">Turfly</div>
            <div className="text-xs text-slate-500">Payment receipt</div>
          </div>
          <div className="text-right text-sm">
            <div className="font-mono">{b.code}</div>
            <div className="text-slate-500">{formatIst(b.createdAt, { dateStyle: "medium" })}</div>
          </div>
        </div>
        <div className="text-sm">
          <div className="font-semibold">{b.turf.name}</div>
          <div className="text-slate-600">{b.turf.addressLine}, {b.turf.city.name} {b.turf.pincode}</div>
          <div className="mt-2">{formatDateLong(b.startAt)} · {formatTimeRange(b.startAt, b.endAt)} · {b.config.name}</div>
        </div>
        <table className="table">
          <tbody>
            <tr><td>Turf booking value</td><td className="text-right">{rupees(b.totalPrice)}</td></tr>
            {b.discount > 0 && <tr><td>Discount</td><td className="text-right">− {rupees(b.discount)}</td></tr>}
            <tr><td>Advance paid online</td><td className="text-right">{rupees(b.advanceAmount)}</td></tr>
            {b.platformFee > 0 && <tr><td>Platform fee</td><td className="text-right">{rupees(b.platformFee)}</td></tr>}
            <tr className="font-semibold"><td>Total paid online</td><td className="text-right">{rupees(b.onlineAmount)}</td></tr>
            <tr><td>Balance payable at venue</td><td className="text-right">{b.balanceCollectedAt ? "Collected" : rupees(b.balanceDue)}</td></tr>
          </tbody>
        </table>
        <div className="space-y-1 text-xs text-slate-500">
          {b.payments.map((p) => (
            <div key={p.id}>
              {p.provider} · {p.providerPaymentId} · {p.method ?? "-"} · {p.status.toLowerCase()} · {rupees(p.amount)}
              {p.refunds.map((r) => ` · refund ${rupees(r.amount)} (${r.status.toLowerCase()})`).join("")}
            </div>
          ))}
        </div>
        <PrintButton />
      </div>
    </div>
  );
}
