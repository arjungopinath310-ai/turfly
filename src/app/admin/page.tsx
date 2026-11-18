import { pageUser } from "@/lib/auth";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { rupees } from "@/lib/engine/pricing";
import { formatIst, formatTimeRange, istToUtc, todayIst } from "@/lib/time";
import { Stat, StatusBadge } from "@/components/ui";
import { plural } from "@/lib/format";

export default async function AdminHome() {
  await pageUser("/admin", ["ADMIN"]);
  const monthStart = istToUtc(todayIst().slice(0, 8) + "01", 0);
  const active = { in: ["CONFIRMED", "COMPLETED"] as ("CONFIRMED" | "COMPLETED")[] };
  const [users, owners, turfs, pending, claims, month, captured, refunds, disputes, recent, byCity, ledger] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "OWNER" } }),
    prisma.turf.groupBy({ by: ["status"], _count: true }),
    prisma.turf.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.turfClaim.count({ where: { status: "PENDING" } }),
    prisma.booking.aggregate({ where: { status: active, confirmedAt: { gte: monthStart } }, _count: true, _sum: { totalPrice: true, discount: true } }),
    prisma.payment.aggregate({ where: { status: { in: ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"] }, capturedAt: { gte: monthStart } }, _sum: { amount: true }, _count: true }),
    prisma.refund.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { amount: true }, _count: true }),
    prisma.dispute.count({ where: { status: "OPEN" } }),
    prisma.booking.findMany({ where: { status: { not: "EXPIRED" } }, orderBy: { createdAt: "desc" }, take: 15, include: { turf: { select: { name: true } }, config: { select: { name: true } } } }),
    prisma.$queryRaw<{ city: string; bookings: bigint }[]>`
      SELECT c.name AS city, COUNT(b.id) AS bookings FROM "Booking" b
      JOIN "Turf" t ON t.id = b."turfId" JOIN "City" c ON c.id = t."cityId"
      WHERE b.status IN ('CONFIRMED','COMPLETED') GROUP BY c.name ORDER BY 2 DESC LIMIT 10`,
    prisma.ledgerEntry.aggregate({ where: { type: "COMMISSION" }, _sum: { amount: true } }),
  ]);
  const count = (s: string) => turfs.find((t) => t.status === s)?._count ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="h1">Platform overview</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Users" value={users} hint={`${owners} turf owners`} />
        <Stat label="Live turfs" value={count("APPROVED")} hint={`${count("UNCLAIMED")} unclaimed · ${count("DRAFT")} draft`} />
        <Stat label="Awaiting review" value={<Link href="/admin/turfs" className="hover:underline">{plural(pending, "turf")} · {plural(claims, "claim")}</Link>} />
        <Stat label="Open disputes" value={<Link href="/admin/finance" className="hover:underline">{disputes}</Link>} />
        <Stat label="Bookings this month" value={month._count} />
        <Stat label="Booking value (GMV)" value={rupees((month._sum.totalPrice ?? 0) - (month._sum.discount ?? 0))} hint="This month" />
        <Stat label="Collected online" value={rupees(captured._sum.amount ?? 0)} hint={`${captured._count} payments · refunds ${rupees(refunds._sum.amount ?? 0)}`} />
        <Stat label="Commission earned (all time)" value={rupees(-(ledger._sum.amount ?? 0))} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="card overflow-x-auto p-5">
          <h2 className="h2 mb-3">Latest bookings</h2>
          <table className="table min-w-[640px]">
            <thead><tr><th>ID</th><th>Turf</th><th>Slot</th><th>Online</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {recent.map((b) => (
                <tr key={b.id}>
                  <td className="font-mono text-xs">{b.code}</td>
                  <td>{b.turf.name}<div className="text-xs text-slate-500">{b.config.name}</div></td>
                  <td className="text-xs">{formatIst(b.startAt, { dateStyle: "medium" })}<br />{formatTimeRange(b.startAt, b.endAt)}</td>
                  <td>{rupees(b.onlineAmount)}</td>
                  <td><StatusBadge status={b.status} /></td>
                  <td className="text-xs text-slate-500">{formatIst(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card p-5">
          <h2 className="h2 mb-3">Bookings by city</h2>
          <ul className="space-y-1 text-sm">
            {byCity.map((c) => <li key={c.city} className="flex justify-between"><span>{c.city}</span><b>{Number(c.bookings)}</b></li>)}
            {byCity.length === 0 && <li className="muted">No bookings yet</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
