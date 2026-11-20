import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { isAppUserAgent } from "@/lib/access";
import { CalendarCheck, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { freeToday, haversineKm, searchTurfs } from "@/lib/search";
import { LOC_COOKIE, parseLoc } from "@/lib/geo";
import { getSettings } from "@/lib/settings";
import { rupees } from "@/lib/engine/pricing";
import { LocationSync } from "@/components/LocationSync";
import { NeighbourhoodMap } from "@/components/NeighbourhoodMap";
import { nearestCity } from "@/lib/places";
import { currentView } from "@/lib/view";
import { formatDateLong, formatTimeRange } from "@/lib/time";
import { TurfCardView } from "@/components/TurfCard";
import { GameCardView } from "@/components/GameCard";
import { findOpenGames } from "@/lib/games";

/** Player home. Turf owners land on their dashboard instead; signed-out visitors never get here (sign-in gate). */
export default async function Home() {
  const user = await currentUser();
  if (user && (await currentView(user.role)) === "owner") redirect("/owner");
  // First time in the app: the welcome screens (they set the cookie, so this happens once per phone)
  if (!user && isAppUserAgent((await headers()).get("user-agent")) && !(await cookies()).get("turfly_welcomed")) redirect("/welcome");
  const loc = parseLoc((await cookies()).get(LOC_COOKIE)?.value);
  const near = loc ? { lat: String(loc.lat), lng: String(loc.lng), sort: "distance" } : null;

  const [towns, turfs, nextMatch, games, settings] = await Promise.all([
    // Towns that have turfs, busiest first, for one-tap search buttons.
    prisma.city.findMany({
      where: { isActive: true, turfs: { some: { status: { in: ["APPROVED", "UNCLAIMED"] }, isSandbox: false } } },
      include: { _count: { select: { turfs: { where: { status: { in: ["APPROVED", "UNCLAIMED"] }, isSandbox: false } } } } },
    }),
    // Nearest first when the phone shared its location (within 30 km; else simply the closest ones)
    near
      ? searchTurfs({ ...near, radius: "30" }, { pageSize: 9, pinDemo: true }).then((r) =>
          // nothing real within 30 km (only the pinned demo): show the closest turfs anywhere instead
          r.total > (r.cards[0]?.isDemo ? 1 : 0) ? r.cards : searchTurfs(near, { pageSize: 9, pinDemo: true }).then((x) => x.cards),
        )
      : searchTurfs({}, { pageSize: 6, pinDemo: true }).then((r) => r.cards),
    user
      ? prisma.booking.findFirst({ where: { userId: user.id, status: "CONFIRMED", startAt: { gte: new Date() } }, include: { turf: { select: { name: true } } }, orderBy: { startAt: "asc" } })
      : null,
    findOpenGames({ take: 8 }).then((g) => g.filter((x) => x.userId !== user?.id)),
    getSettings(),
  ]);
  const [free, here] = await Promise.all([freeToday(turfs), loc ? nearestCity(loc.lat, loc.lng, 40) : null]);
  const fee = rupees(settings.bookingFeePaise);
  // Towns across India: the closest ones when we know where the player is, else the busiest; a handful only
  if (loc) towns.sort((a, b) => haversineKm(loc, a) - haversineKm(loc, b));
  else towns.sort((a, b) => b._count.turfs - a._count.turfs);
  towns.splice(10);
  const first = user?.name?.trim().split(/\s+/)[0];

  return (
    <>
      <section className="relative overflow-hidden bg-pitch-night text-white">
        <div className="absolute inset-0 opacity-30 [background:radial-gradient(60%_60%_at_70%_20%,#12b76a_0%,transparent_60%),repeating-linear-gradient(90deg,transparent_0_78px,rgba(255,255,255,.05)_78px_80px)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-12 pt-7 sm:pb-16 sm:pt-12 lg:grid-cols-[1.15fr_1fr]">
          <div className="min-w-0">
          {/* Where you are: tap to update; it also finds turfs around you that Turfly doesn't list yet */}
          <LocationSync active={Boolean(near)} ask tone="dark" label={here ? `📍 ${here.name}` : "📍 Near you"} />
          {first && <p className="mt-5 font-semibold text-brand-300">Hi {first}, ready to play?</p>}
          <h1 className={`${first ? "mt-1" : "mt-5"} max-w-3xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl`}>
            Book turfs. Join games.<br />Find players near you.
          </h1>
          <p className="mt-3 text-slate-300">Every turf around you with free slots and prices. Book for {fee} and pay the rest at the turf.</p>
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
          <div className="hidden overflow-hidden rounded-3xl ring-1 ring-white/10 lg:block">
            <NeighbourhoodMap variant="players" className="block h-auto w-full" />
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

        {games.length > 0 && (
          <section>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Games you can join</h2>
                <p className="text-sm text-slate-500">No team? These are booked and short of players.</p>
              </div>
              <Link href="/games" className="shrink-0 text-sm font-semibold text-brand-700 hover:underline">See all →</Link>
            </div>
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
              {games.slice(0, 6).map((g) => (
                <GameCardView key={g.id} g={g} compact />
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div className="mr-auto">
              <h2 className="text-xl font-bold tracking-tight">{near ? "Turfs near you" : "Turfs"}</h2>
              <p className="text-sm text-slate-500">{near ? "Closest first, with today's free slots." : "Share your location to see the closest turfs first."}</p>
            </div>
            <Link href={near ? `/turfs?${new URLSearchParams(near)}` : "/turfs"} className="text-sm font-semibold text-brand-700 hover:underline">See all & map →</Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {turfs.map((t) => (
              <TurfCardView key={t.id} t={t} free={free[t.id]} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
