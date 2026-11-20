import Link from "next/link";
import clsx from "clsx";
import { Trophy } from "lucide-react";
import { pageUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { homeCityOf, leaderboard } from "@/lib/player-stats";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Leaderboard" };

/** Most matches played in the last 30 days: in the player's town, or across India. */
export default async function Leaderboard(props: { searchParams: Promise<{ scope?: string }> }) {
  const sp = await props.searchParams;
  const user = await pageUser("/leaderboard");
  const cityId = await homeCityOf(user.id);
  const india = sp.scope === "india" || !cityId;
  const [board, city] = await Promise.all([leaderboard({ cityId: india ? null : cityId }), cityId ? prisma.city.findUnique({ where: { id: cityId }, select: { name: true } }) : null]);
  const me = board.rankOf(user.id);
  const medal = (r: number) => (r === 1 ? "bg-amber-400 text-white" : r === 2 ? "bg-slate-300 text-slate-800" : r === 3 ? "bg-orange-300 text-white" : "bg-slate-100 text-slate-600");
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <PageHeader title="Leaderboard" subtitle="Most matches played in the last 30 days" />
      <div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-white p-1 text-sm">
        {city && <Link href="/leaderboard" className={clsx("rounded-lg px-3 py-1.5 font-medium", !india ? "bg-slate-900 text-white" : "text-slate-600")}>{city.name}</Link>}
        <Link href="/leaderboard?scope=india" className={clsx("rounded-lg px-3 py-1.5 font-medium", india ? "bg-slate-900 text-white" : "text-slate-600")}>All of India</Link>
      </div>

      <div className="card mb-4 flex items-center gap-4 p-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600"><Trophy size={20} /></span>
        <div className="text-sm">
          {me ? <><b className="text-base">You&apos;re #{me.rank}</b> of {board.players} players with {me.matches} match{me.matches === 1 ? "" : "es"}.</> : <>Play a match this month to get on the board.</>}
          {user.hideFromLeaderboard && <span className="block text-xs text-slate-500">Others don&apos;t see your name (<Link href="/profile" className="underline">change</Link>).</span>}
        </div>
      </div>

      {board.rows.length === 0 ? (
        <div className="card p-6 text-center text-sm text-slate-500">No matches played here in the last 30 days yet.</div>
      ) : (
        <ol className="card divide-y divide-slate-100">
          {board.rows.map((r) => (
            <li key={r.userId} className={clsx("flex items-center gap-3 px-4 py-3", r.userId === user.id && "bg-brand-50")}>
              <span className={clsx("grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold", medal(r.rank))}>{r.rank}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{r.userId === user.id ? `${r.name} (you)` : r.name}</span>
              <span className="text-sm font-semibold text-slate-700">{r.matches} <span className="font-normal text-slate-400">match{r.matches === 1 ? "" : "es"}</span></span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-4 text-center text-xs text-slate-500">Counts matches you booked, joined from “Games you can join”, or were named on a team for. <Link href="/profile" className="underline">Leaderboard settings</Link></p>
    </div>
  );
}
