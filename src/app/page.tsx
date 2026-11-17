import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { searchTurfs } from "@/lib/search";
import { currentView } from "@/lib/view";
import { formatDateLong, formatTimeRange } from "@/lib/time";
import { TurfCardView } from "@/components/TurfCard";

/** Player home. Turf owners land on their dashboard instead; signed-out visitors never get here (sign-in gate). */
export default async function Home() {
  const user = await currentUser();
  if (user && (await currentView(user.role)) === "owner") redirect("/owner");

  const [towns, turfs, nextMatch] = await Promise.all([
    // Towns that have turfs, busiest first, for one-tap search buttons.
    prisma.city.findMany({
      where: { isActive: true, turfs: { some: { status: { in: ["APPROVED", "UNCLAIMED"] } } } },
      include: { _count: { select: { turfs: { where: { status: { in: ["APPROVED", "UNCLAIMED"] } } } } } },
    }),
    searchTurfs({}).then((r) => r.slice(0, 6)),
    user
      ? prisma.booking.findFirst({ where: { userId: user.id, status: "CONFIRMED", startAt: { gte: new Date() } }, include: { turf: { select: { name: true } } }, orderBy: { startAt: "asc" } })
      : null,
  ]);
  towns.sort((a, b) => b._count.turfs - a._count.turfs);
  const first = user?.name?.trim().split(/\s+/)[0];

  return (
    <>
      <section className="relative overflow-hidden bg-pitch-night text-white">
        <div className="absolute inset-0 opacity-30 [background:radial-gradient(60%_60%_at_70%_20%,#12b76a_0%,transparent_60%),repeating-linear-gradient(90deg,transparent_0_78px,rgba(255,255,255,.05)_78px_80px)]" />
        <div className="relative mx-auto max-w-6xl px-4 pb-12 pt-10 sm:pb-16 sm:pt-16">
          <h1 className="max-w-3xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            {first ? `Hi ${first}, ready to play?` : "Ready to play?"}
          </h1>
          <p className="mt-2 text-slate-300">Find a football turf near you.</p>
          <form action="/turfs" className="mt-6 flex max-w-2xl gap-2 rounded-2xl bg-white p-2 text-slate-900 shadow-2xl">
            <input name="q" className="input flex-1 border-0 focus:ring-0" placeholder="Search by turf name" aria-label="Search by turf name" />
            <button className="btn-primary px-5">Search</button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {towns.map((t) => (
              <Link key={t.id} href={`/turfs?city=${t.slug}`} className="chip border-white/20 bg-white/5 text-slate-100 hover:bg-white/15">
                {t.name} <span className="text-slate-400">{t._count.turfs}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-10 px-4 pt-8">
        {nextMatch && (
          <Link href={`/bookings/${nextMatch.id}`} className="card flex items-center gap-4 p-4 hover:shadow-lg">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><CalendarCheck size={20} /></span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-brand-700">Your next match</div>
              <div className="truncate font-semibold">{nextMatch.turf.name}</div>
              <div className="text-sm text-slate-500">{formatDateLong(nextMatch.startAt)} · {formatTimeRange(nextMatch.startAt, nextMatch.endAt)}</div>
            </div>
            <ChevronRight className="text-slate-400" />
          </Link>
        )}

        <section>
          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-xl font-bold tracking-tight">Turfs</h2>
            <Link href="/turfs" className="text-sm font-semibold text-brand-700 hover:underline">See all & map →</Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {turfs.map((t) => (
              <TurfCardView key={t.id} t={t} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
