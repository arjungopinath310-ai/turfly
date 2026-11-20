import Link from "next/link";
import clsx from "clsx";
import { Award, CalendarCheck, Flame, Medal, MoonStar, Shield, Trophy, Users, Wallet, Compass } from "lucide-react";
import { ACTIVITY_LEVELS, type playerProfile } from "@/lib/player-stats";
import { formatDateLong } from "@/lib/time";
import { ActionForm } from "./ActionForm";

type Profile = Awaited<ReturnType<typeof playerProfile>>;
type Result = { ok?: string; error?: string } | null;

const BADGE_ICON: Record<string, typeof Award> = { "on-time": Shield, "team-player": Users, host: CalendarCheck, explorer: Compass, "night-owl": MoonStar, "settles-up": Wallet };
const initials = (n: string | null) => (n ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/** The player's own card on their profile: matches, teammates, reliability, weekly goal, level, badges, rank. */
export function PlayerCard({ name, p, rank, setGoal }: { name: string | null; p: Profile; rank: { rank: number; of: number; town: string | null } | null; setGoal: (s: Result, fd: FormData) => Promise<Result> }) {
  const goal = p.goal;
  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xl font-extrabold text-white">{initials(name)}</span>
          <div className="min-w-0">
            <div className="truncate text-lg font-bold">{name ?? "Player"}</div>
            <div className="text-sm text-slate-500">{p.lastPlayed ? `Last played ${formatDateLong(p.lastPlayed)}` : "No matches yet: book one or join a game"}</div>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-3 divide-x divide-slate-100 text-center">
          {[
            [p.played, "Matches"],
            [p.teammates, "Teammates"],
            [`${p.reliability}%`, "Turned up"],
          ].map(([v, l]) => (
            <div key={l as string}>
              <dt className="sr-only">{l}</dt>
              <dd className="text-2xl font-extrabold">{v}</dd>
              <div className="text-xs text-slate-500">{l}</div>
            </div>
          ))}
        </dl>
        {p.noShows > 0 && <p className="mt-3 text-center text-xs text-amber-700">{p.noShows} no-show{p.noShows > 1 ? "s" : ""}: turning up for your next matches brings this back up.</p>}
      </section>

      <section className="card p-5">
        <div className="flex items-center gap-2 font-semibold"><Flame size={18} className="text-orange-500" /> Weekly goal</div>
        {goal ? (
          <>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-extrabold">{goal.thisWeek} <span className="text-base font-semibold text-slate-400">of {goal.target}</span></span>
              <span className="text-sm text-slate-500">{goal.streak > 0 ? `${goal.streak}-week streak` : `This week, until ${formatDateLong(new Date(`${goal.weekEnds}T12:00:00+05:30`)).split(",")[0]}`}</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={goal.target} aria-valuenow={goal.thisWeek}>
              <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-brand-500" style={{ width: `${Math.min(100, (100 * goal.thisWeek) / goal.target)}%` }} />
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-600">How many matches do you want to play each week? We&apos;ll track it for you.</p>
        )}
        <ActionForm action={setGoal} submit={null} className="mt-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-full text-slate-500 sm:w-auto">{goal ? "Change your goal:" : "Matches a week:"}</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} name="goal" value={n} className={clsx("h-9 w-9 rounded-full border font-semibold", goal?.target === n ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:border-slate-400")}>{n}</button>
            ))}
            {goal && <button name="goal" value={0} className="ml-1 text-xs text-slate-500 underline">Remove</button>}
          </div>
        </ActionForm>
      </section>

      <section className="card p-5">
        <div className="font-semibold">Activity level</div>
        <ol className="mt-4 grid grid-cols-4 gap-1 text-center text-[11px]">
          {ACTIVITY_LEVELS.map((l, i) => (
            <li key={l.label} className="flex flex-col items-center gap-1.5">
              <span className={clsx("h-2 w-full rounded-full", i <= p.level.index ? "bg-brand-500" : "bg-slate-200")} />
              <span className={clsx(i === p.level.index ? "font-bold text-slate-900" : "text-slate-400")}>{l.label}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-slate-600">{p.last30} match{p.last30 === 1 ? "" : "es"} in the last 30 days.</p>
      </section>

      <section className="card p-5">
        <div className="flex items-center gap-2 font-semibold"><Award size={18} className="text-brand-600" /> Badges</div>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {p.badges.map((b) => {
            const I = BADGE_ICON[b.key] ?? Medal;
            return (
              <li key={b.key} className={clsx("rounded-2xl border p-3", b.earned ? "border-brand-200 bg-brand-50" : "border-slate-200")}>
                <div className="flex items-center gap-2">
                  <span className={clsx("grid h-8 w-8 place-items-center rounded-full", b.earned ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-400")}><I size={16} /></span>
                  <span className={clsx("text-sm font-semibold leading-tight", !b.earned && "text-slate-600")}>{b.title}</span>
                </div>
                <div className="mt-2 text-[11px] leading-snug text-slate-500">{b.hint}</div>
                {!b.earned && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-400" style={{ width: `${(100 * b.progress) / b.target}%` }} /></div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <Link href="/leaderboard" className="card flex items-center gap-4 p-5 hover:shadow-lg">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600"><Trophy size={20} /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Leaderboard</span>
          <span className="block text-sm text-slate-500">
            {rank ? `You're #${rank.rank} of ${rank.of} players${rank.town ? ` in ${rank.town}` : ""} this month` : "Play a match this month to get a rank"}
          </span>
        </span>
        <span className="text-sm font-semibold text-brand-700">View →</span>
      </Link>
    </div>
  );
}
