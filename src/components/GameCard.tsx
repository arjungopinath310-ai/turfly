import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { rupees } from "@/lib/engine/pricing";
import type { GameCard } from "@/lib/games";
import { dayWord, spotsLabel } from "@/lib/games-shared";
import { formatTimeRange } from "@/lib/time";

/** One open game: when, where, format and how many spots are left. The whole card opens the game. */
export function GameCardView({ g, mine, compact }: { g: GameCard; mine?: boolean; compact?: boolean }) {
  return (
    <Link href={`/games/${g.id}`} className={`card block border-l-4 border-l-ink p-4 transition active:bg-slate-50 sm:hover:border-ink sm:hover:shadow-lift ${compact ? "w-[272px] shrink-0 sm:w-auto" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="kicker truncate">{dayWord(g.startAt)} · {g.playersPerSide}-a-side</span>
        <ChevronRight size={16} className="shrink-0 text-slate-400" />
      </div>
      <div className="score mt-1 whitespace-nowrap text-[22px] leading-tight">{formatTimeRange(g.startAt, g.booking?.endAt ?? g.startAt)}</div>
      <div className="truncate text-sm text-slate-700">{g.turf?.name ?? "Venue to be confirmed"}{g.turf?.city ? <span className="text-slate-500"> · {g.turf.city.name}</span> : null}</div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 truncate text-xs text-slate-500">
          <Users size={13} className="shrink-0" />
          {mine ? "Your game" : `by ${g.user.name?.split(/\s+/)[0] ?? "Player"}`}
          {g.skillLevel ? ` · ${g.skillLevel}` : ""}
          {g.sharePerPlayer ? ` · ~${rupees(g.sharePerPlayer)} each` : ""}
        </span>
        <span className="shrink-0 rounded border border-ink bg-volt px-2 py-0.5 font-display text-[13px] font-bold uppercase tracking-[.04em] text-ink">{spotsLabel(g.spots)}</span>
      </div>
      {!compact && g.note && <p className="mt-2 line-clamp-2 text-sm text-slate-700">{g.note}</p>}
    </Link>
  );
}
