import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rupees } from "@/lib/engine/pricing";
import { formatDateLong, formatTimeRange } from "@/lib/time";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";

export default async function BookingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/bookings");
  const all = await prisma.booking.findMany({
    where: { userId: user.id, status: { in: ["CONFIRMED", "COMPLETED", "CANCELLED", "HELD", "NO_SHOW"] } },
    include: { turf: { select: { name: true } }, config: { select: { name: true } }, team: { select: { name: true } } },
    orderBy: { startAt: "desc" },
    take: 200,
  });
  const now = Date.now();
  const upcoming = all.filter((b) => b.endAt.getTime() >= now && ["CONFIRMED", "HELD"].includes(b.status)).reverse();
  const past = all.filter((b) => !upcoming.includes(b));

  const List = ({ items }: { items: typeof all }) => (
    <div className="space-y-2">
      {items.map((b) => (
        <Link key={b.id} href={b.status === "HELD" ? `/checkout/${b.id}` : `/bookings/${b.id}`} className="card flex flex-col gap-2 p-4 transition hover:shadow-lg sm:flex-row sm:items-center">
          <div className="w-24 shrink-0 text-center sm:border-r sm:border-slate-100 sm:pr-4">
            <div className="text-xs uppercase text-slate-500">{formatDateLong(b.startAt).split(",")[0]}</div>
            <div className="text-sm font-bold">{formatDateLong(b.startAt).split(",").slice(1).join(",")}</div>
          </div>
          <div className="flex-1">
            <div className="font-semibold">{b.turf.name}</div>
            <div className="text-sm text-slate-500">{formatTimeRange(b.startAt, b.endAt)} · {b.config.name}{b.team || b.teamName ? ` · ${b.teamName ?? b.team?.name}` : ""}</div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">{b.code}</span>
            {b.balanceDue > 0 && b.status === "CONFIRMED" && !b.balanceCollectedAt && <span className="text-slate-600">{rupees(b.balanceDue)} at venue</span>}
            <StatusBadge status={b.status} />
          </div>
        </Link>
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <PageHeader title="My bookings">
        <Link href="/turfs" className="btn-primary">Book a turf</Link>
      </PageHeader>
      <h2 className="h2 mb-3">Upcoming</h2>
      {upcoming.length ? <List items={upcoming} /> : <Empty title="No upcoming matches">Find a turf and reserve a slot with a ₹49 advance.</Empty>}
      {past.length > 0 && (
        <>
          <h2 className="h2 mb-3 mt-10">Previous</h2>
          <List items={past} />
        </>
      )}
    </div>
  );
}
