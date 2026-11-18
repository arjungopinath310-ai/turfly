import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rupees } from "@/lib/engine/pricing";
import { formatTimeRange } from "@/lib/time";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";

const IST_WD = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short" });
const IST_DAY = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric" });
const IST_MON = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short" });

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

  // One compact row per booking: date tile, turf and time, status. Easy to scan on a phone.
  const List = ({ items, muted }: { items: typeof all; muted?: boolean }) => (
    <div className="space-y-2">
      {items.map((b) => (
        <Link key={b.id} href={b.status === "HELD" ? `/checkout/${b.id}` : `/bookings/${b.id}`} className="card flex items-center gap-3 p-3 transition active:scale-[.99] sm:p-4 sm:hover:shadow-lg">
          <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl text-center leading-none ${muted ? "bg-slate-100 text-slate-600" : "bg-brand-50 text-brand-800"}`}>
            <div>
              <div className="text-[10px] font-semibold uppercase">{IST_WD.format(b.startAt)}</div>
              <div className="my-0.5 text-lg font-bold">{IST_DAY.format(b.startAt)}</div>
              <div className="text-[10px]">{IST_MON.format(b.startAt)}</div>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{b.turf.name}</div>
            <div className="truncate text-sm text-slate-500">{formatTimeRange(b.startAt, b.endAt)} · {b.config.name}{b.team || b.teamName ? ` · ${b.teamName || b.team?.name}` : ""}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <StatusBadge status={b.status} />
              {b.status === "HELD" && <span className="font-semibold text-amber-700">Finish payment →</span>}
              {b.balanceDue > 0 && b.status === "CONFIRMED" && !b.balanceCollectedAt && <span className="text-slate-600">{rupees(b.balanceDue)} to pay at turf</span>}
            </div>
          </div>
          <ChevronRight size={18} className="shrink-0 text-slate-300" />
        </Link>
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:py-8">
      <PageHeader title="My bookings">
        <Link href="/turfs" className="btn-primary hidden sm:inline-flex">Book a turf</Link>
      </PageHeader>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Upcoming</h2>
      {upcoming.length ? (
        <List items={upcoming} />
      ) : (
        <Empty title="No upcoming matches">
          Find a turf and reserve a slot in a minute. No team? Join a game that&apos;s short of players.
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Link href="/turfs" className="btn-primary">Find a turf</Link>
            <Link href="/games" className="btn-ghost">Join a game</Link>
          </div>
        </Empty>
      )}
      {past.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Previous</h2>
          <List items={past} muted />
        </>
      )}
    </div>
  );
}
