import { pageUser } from "@/lib/auth";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { rupees } from "@/lib/engine/pricing";
import { formatIst } from "@/lib/time";
import { ActionForm } from "@/components/ActionForm";
import { StatusBadge } from "@/components/ui";
import { adminRefund, resolveDispute } from "../actions";
import { formatPhone } from "@/lib/format";

export default async function Finance(props: { searchParams: Promise<{ q?: string }> }) {
  const searchParams = await props.searchParams;
  await pageUser("/admin/finance", ["ADMIN"]);
  const q = searchParams.q?.trim();
  const [disputes, payments, refunds, webhooks] = await Promise.all([
    prisma.dispute.findMany({ where: { status: "OPEN" }, include: { booking: { include: { turf: true, payments: true } }, raisedBy: true }, orderBy: { createdAt: "asc" } }),
    prisma.payment.findMany({
      where: q ? { OR: [{ providerOrderId: { contains: q } }, { providerPaymentId: { contains: q } }, { booking: { code: { contains: q, mode: "insensitive" } } }] } : {},
      include: { booking: { select: { code: true, id: true, turf: { select: { name: true } } } }, user: { select: { name: true, phone: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.refund.findMany({ include: { payment: { include: { booking: { select: { code: true } } } } }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.webhookEvent.findMany({ where: { OR: [{ error: { not: null } }, { signatureValid: false }] }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="h1 mb-4">Disputes</h1>
        {disputes.length === 0 && <p className="muted">No open disputes.</p>}
        <div className="space-y-3">
          {disputes.map((d) => {
            const paid = d.booking.payments.reduce((a, p) => a + (p.status === "CAPTURED" || p.status === "PARTIALLY_REFUNDED" ? p.amount - p.refundedAmount : 0), 0);
            return (
              <div key={d.id} className="card p-5">
                <div className="flex justify-between text-sm">
                  <b>{d.booking.code} · {d.booking.turf.name}</b>
                  <span className="text-slate-500">{formatIst(d.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm">“{d.reason}”, {d.raisedBy.name ?? d.raisedBy.phone}</p>
                <p className="text-xs text-slate-500">Refundable online balance: {rupees(paid)}</p>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <ActionForm action={adminRefund} className="flex flex-wrap gap-2" submit="Refund & resolve" submitClass="btn-primary btn-sm">
                    <input type="hidden" name="bookingId" value={d.bookingId} />
                    <input type="hidden" name="disputeId" value={d.id} />
                    <input name="amount" type="number" step="0.01" max={paid / 100} defaultValue={paid / 100} className="input w-24 py-1.5" />
                    <input name="reason" placeholder="Resolution" className="input flex-1 py-1.5" />
                  </ActionForm>
                  <ActionForm action={resolveDispute} className="flex flex-wrap gap-2" submit={null}>
                    <input type="hidden" name="disputeId" value={d.id} />
                    <input name="resolution" placeholder="Resolution without refund" className="input flex-1 py-1.5" />
                    <button name="status" value="RESOLVED" className="btn-ghost btn-sm">Resolve</button>
                    <button name="status" value="REJECTED" className="btn-danger btn-sm">Reject</button>
                  </ActionForm>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card overflow-x-auto p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="h2">Payments</h2>
          <form><input name="q" defaultValue={q} placeholder="Booking ID / order / payment id" className="input py-1.5" /></form>
        </div>
        <table className="table min-w-[900px]">
          <thead><tr><th>When</th><th>Booking</th><th>Customer</th><th>Gateway ids</th><th>Amount</th><th>Status</th><th>Refund</th></tr></thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="text-xs">{formatIst(p.createdAt)}</td>
                <td className="text-xs"><b className="font-mono">{p.booking.code}</b><br />{p.booking.turf.name}</td>
                <td className="text-xs">{p.user?.name ?? "—"}<br />{formatPhone(p.user?.phone)}</td>
                <td className="font-mono text-[10px]">{p.providerOrderId}<br />{p.providerPaymentId}<br />{p.method}</td>
                <td>{rupees(p.amount)}{p.refundedAmount > 0 && <div className="text-xs text-sky-700">−{rupees(p.refundedAmount)}</div>}</td>
                <td><StatusBadge status={p.status} />{p.clientVerifiedAt && <div className="text-[10px] text-slate-400">client sig ✓</div>}</td>
                <td>
                  {(p.status === "CAPTURED" || p.status === "PARTIALLY_REFUNDED") && (
                    <ActionForm action={adminRefund} className="flex gap-1" submit="Refund" submitClass="btn-ghost btn-sm">
                      <input type="hidden" name="bookingId" value={p.booking.id} />
                      <input name="amount" type="number" step="0.01" defaultValue={(p.amount - p.refundedAmount) / 100} className="input w-20 py-1" />
                      <input name="reason" placeholder="reason" className="input w-24 py-1" />
                    </ActionForm>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="h2 mb-3">Recent refunds</h2>
          <ul className="space-y-1 text-sm">
            {refunds.map((r) => (
              <li key={r.id} className="flex justify-between gap-2"><span className="font-mono text-xs">{r.payment.booking.code}</span><span className="flex-1 truncate text-xs text-slate-500">{r.reason}</span><span>{rupees(r.amount)}</span><StatusBadge status={r.status} /></li>
            ))}
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="h2 mb-3">Webhook problems</h2>
          <ul className="space-y-1 text-xs">
            {webhooks.map((w) => (
              <li key={w.id}><b>{w.type}</b> · {formatIst(w.createdAt)} · {w.signatureValid ? "" : "INVALID SIGNATURE · "}{w.error}</li>
            ))}
            {webhooks.length === 0 && <li className="muted">None 🎉</li>}
          </ul>
          <p className="mt-2 text-[11px] text-slate-400">Failed events return HTTP 500 so Razorpay retries them automatically. Look up any booking with <Link href="/admin/finance" className="underline">search</Link>.</p>
        </section>
      </div>
    </div>
  );
}
