import Link from "next/link";
import type { Metadata } from "next";
import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { findOpenGames, openGamesWhere } from "@/lib/games";
import { dayWord } from "@/lib/games-shared";
import { formatTimeRange } from "@/lib/time";
import { Empty } from "@/components/ui";
import { GameCardView } from "@/components/GameCard";

export const metadata: Metadata = { title: "Join a game" };

const REQ_TEXT: Record<string, string> = { PENDING: "Waiting for reply", ACCEPTED: "You're in", DECLINED: "Not this time" };

/** Booked games that are short of players: for players without a team. Plus the games you run or asked to join. */
export default async function Games(props: { searchParams: Promise<{ town?: string; format?: string }> }) {
  const sp = await props.searchParams;
  const user = await currentUser();
  // Anyone can see the games; joining one (the game's page) needs an account
  const town = sp.town || undefined;
  const format = [5, 6, 7, 8, 9, 11].includes(Number(sp.format)) ? Number(sp.format) : undefined;
  const now = new Date();

  const [games, towns, formats, organising, asked] = await Promise.all([
    findOpenGames({ town, format, take: 60 }),
    prisma.city.findMany({ where: { posts: { some: openGamesWhere() } }, select: { slug: true, name: true }, orderBy: { name: "asc" } }),
    prisma.playerPost.groupBy({ by: ["playersPerSide"], where: openGamesWhere(), orderBy: { playersPerSide: "asc" } }),
    !user ? [] : prisma.playerPost.findMany({
      where: { userId: user.id, startAt: { gt: now }, status: { in: ["DRAFT", "OPEN", "FILLED"] }, booking: { status: { in: ["HELD", "CONFIRMED"] } } },
      include: { turf: { select: { name: true } }, booking: { select: { endAt: true } }, requests: { where: { status: { in: ["PENDING", "ACCEPTED"] } }, select: { status: true } } },
      orderBy: { startAt: "asc" },
    }),
    !user ? [] : prisma.playerPostRequest.findMany({
      where: { userId: user.id, status: { in: ["PENDING", "ACCEPTED", "DECLINED"] }, post: { startAt: { gt: now } } },
      include: { post: { include: { turf: { select: { name: true } }, booking: { select: { endAt: true } } } } },
      orderBy: { post: { startAt: "asc" } },
    }),
  ]);
  const href = (q: { town?: string; format?: number }) => {
    const u = new URLSearchParams();
    if (q.town) u.set("town", q.town);
    if (q.format) u.set("format", String(q.format));
    const s = u.toString();
    return s ? `/games?${s}` : "/games";
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-6 sm:pt-8">
      <h1 className="h1">Join a game</h1>
      <p className="muted mt-1">No team? These games are booked but short of players. Ask to join and chat with the organiser.</p>

      {(organising.length > 0 || asked.length > 0) && (
        <section className="mt-5 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your games</h2>
          {organising.map((p) => {
            const pending = p.requests.filter((r) => r.status === "PENDING").length;
            const joined = p.requests.length - pending;
            return (
              <Link key={p.id} href={`/games/${p.id}`} className="card flex items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{dayWord(p.startAt)} · {formatTimeRange(p.startAt, p.booking?.endAt ?? p.startAt)}</span>
                  <span className="block truncate text-xs text-slate-500">
                    You&apos;re organising · {p.turf?.name} · {p.status === "DRAFT" ? "waiting for payment" : `${joined}/${p.playersNeeded} joined`}
                  </span>
                </span>
                {pending > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{pending} asking</span>}
                <ChevronRight size={16} className="text-slate-400" />
              </Link>
            );
          })}
          {asked.map((r) => (
            <Link key={r.id} href={`/games/${r.postId}`} className="card flex items-center gap-3 p-3">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{dayWord(r.post.startAt)} · {formatTimeRange(r.post.startAt, r.post.booking?.endAt ?? r.post.startAt)}</span>
                <span className="block truncate text-xs text-slate-500">{r.post.turf?.name}</span>
              </span>
              <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", r.status === "ACCEPTED" ? "bg-brand-100 text-brand-800" : r.status === "PENDING" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500")}>
                {REQ_TEXT[r.status]}
              </span>
              <ChevronRight size={16} className="text-slate-400" />
            </Link>
          ))}
        </section>
      )}

      <div className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <Chip on={!town && !format} href="/games">All</Chip>
        {formats.map((f) => (
          <Chip key={f.playersPerSide} on={format === f.playersPerSide} href={href({ town, format: format === f.playersPerSide ? undefined : f.playersPerSide })}>{f.playersPerSide}s</Chip>
        ))}
        {towns.map((t) => (
          <Chip key={t.slug} on={town === t.slug} href={href({ town: town === t.slug ? undefined : t.slug, format })}>{t.name}</Chip>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {games.map((g) => <GameCardView key={g.id} g={g} mine={g.userId === user?.id} />)}
      </div>
      {games.length === 0 && (
        <div className="mt-4">
          <Empty title="No open games right now">
            Booking a slot but short of players? Tick <b>Short of players?</b> when you book, or list it later from{" "}
            <Link href="/bookings" className="font-semibold text-brand-700 underline">My bookings</Link>.
          </Empty>
        </div>
      )}
      {games.length > 0 && (
        <p className="mt-6 text-center text-xs text-slate-500">
          Short of players for your own booking? Tick <b>Short of players?</b> when you book, or list it from <Link href="/bookings" className="underline">My bookings</Link>.
        </p>
      )}
    </div>
  );
}

const Chip = ({ on, href, children }: { on: boolean; href: string; children: React.ReactNode }) => (
  <Link href={href} aria-current={on ? "true" : undefined}
    className={clsx("chip shrink-0 px-3.5 py-1.5 text-sm", on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700")}>
    {children}
  </Link>
);
