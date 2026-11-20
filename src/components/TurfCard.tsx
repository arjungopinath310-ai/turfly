import Link from "next/link";
import { MapPin, Star } from "lucide-react";
import type { TurfCard } from "@/lib/search";
import { rupees } from "@/lib/engine/pricing";
import { shortTime } from "@/lib/time";
import { AvailabilityBadge, DemoBadge } from "./ui";
import { CompareToggle } from "./CompareBar";
import { TurfThumb } from "./TurfThumb";

/**
 * Phones: a compact row (small picture left, facts right) so a whole list fits on screen, like booking apps.
 * Larger screens: the usual card with a picture on top. The whole card is one big tap target.
 */
export function TurfCardView({ t, free }: { t: TurfCard; free?: number | null }) {
  const price = t.minPrice ?? t.reportedPriceFrom;
  return (
    <div className={`card group relative flex gap-3 overflow-hidden p-2.5 transition active:scale-[.99] sm:block sm:p-0 sm:hover:-translate-x-0.5 sm:hover:-translate-y-0.5 sm:hover:border-ink sm:hover:shadow-lift ${t.isDemo ? "border-ink" : ""}`}>
      <Link href={`/turfs/${t.slug}`} className="absolute inset-0 z-0" aria-label={t.name} />
      <div className="relative h-[92px] w-[92px] shrink-0 overflow-hidden rounded-lg bg-ink sm:aspect-[16/9] sm:h-auto sm:w-full sm:rounded-none">
        <TurfThumb photo={t.photo} name={t.name} />
        <div className="absolute left-1.5 top-1.5 hidden gap-1.5 sm:left-3 sm:top-3 sm:flex">
          {t.isFeatured && <span className="chip border-ink bg-white text-ink">Featured</span>}
          {t.isDemo && <DemoBadge />}
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-1 sm:space-y-2 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="line-clamp-2 font-display text-[19px] font-bold leading-[1.1]">{t.name}</div>
          {price != null && (
            <div className="shrink-0 text-right leading-tight" title={t.minPrice == null ? "Reported price, not confirmed by the turf" : undefined}>
              <div className={`score text-lg leading-none ${t.minPrice == null ? "text-slate-600" : ""}`}>{t.minPrice == null ? "~" : ""}{rupees(price)}</div>
              <div className="mt-0.5 font-display text-[11px] font-semibold uppercase tracking-[.06em] text-slate-500">{t.minPrice == null ? "reported/hr" : "per hour"}</div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 truncate text-xs text-slate-500 sm:text-sm">
          <MapPin size={13} className="shrink-0" />
          <span className="truncate">{t.locality}{t.locality !== t.city ? `, ${t.city}` : ""}</span>
          {t.distanceKm != null && <span className="score shrink-0 text-slate-800">· {t.distanceKm.toFixed(1)} km</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {t.isDemo && <span className="sm:hidden"><DemoBadge /></span>}
          <AvailabilityBadge mode={t.availabilityMode} updatedAt={t.availabilityUpdatedAt} />
          {t.formats.map((f) => (
            <span key={f} className="chip border-slate-300 text-slate-700">{f}s</span>
          ))}
          {t.ratingCount > 0 && (
            <span className="flex items-center gap-0.5 text-xs font-semibold text-slate-700"><Star size={12} className="fill-amber-400 text-amber-400" /> {t.ratingAvg.toFixed(1)} <span className="font-normal text-slate-400">({t.ratingCount})</span></span>
          )}
        </div>
        {free !== undefined && (
          <div className={`flex items-center gap-1.5 font-display text-[13px] font-bold uppercase tracking-[.05em] ${free != null ? "text-brand-700" : "text-slate-400"}`}>
            <span className={`h-2 w-2 rounded-full ${free != null ? "bg-brand-500 ring-2 ring-brand-100" : "bg-slate-300"}`} />
            {free != null ? `Free today from ${shortTime(free)}` : "Full today · check tomorrow"}
          </div>
        )}
        <div className="relative z-10 hidden justify-end pt-1 text-sm sm:flex">
          <CompareToggle id={t.id} name={t.name} />
        </div>
      </div>
    </div>
  );
}
