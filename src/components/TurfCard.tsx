import Link from "next/link";
import { MapPin, Star } from "lucide-react";
import type { TurfCard } from "@/lib/search";
import { rupees } from "@/lib/engine/pricing";
import { AvailabilityBadge, DemoBadge } from "./ui";
import { CompareToggle } from "./CompareBar";

/**
 * Phones: a compact row (small picture left, facts right) so a whole list fits on screen, like booking apps.
 * Larger screens: the usual card with a picture on top. The whole card is one big tap target.
 */
export function TurfCardView({ t }: { t: TurfCard }) {
  const price = t.minPrice ?? t.reportedPriceFrom;
  return (
    <div className="card group relative flex gap-3 overflow-hidden p-3 transition active:scale-[.99] sm:block sm:p-0 sm:hover:-translate-y-0.5 sm:hover:shadow-lg">
      <Link href={`/turfs/${t.slug}`} className="absolute inset-0 z-0" aria-label={t.name} />
      <div className="relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-brand-700 to-brand-950 sm:aspect-[16/9] sm:h-auto sm:w-full sm:rounded-none">
        {t.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.photo} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full place-items-center text-3xl opacity-60 sm:text-5xl">⚽</div>
        )}
        <div className="absolute left-1.5 top-1.5 hidden gap-1.5 sm:left-3 sm:top-3 sm:flex">
          {t.isFeatured && <span className="chip border-amber-300 bg-amber-100 text-amber-800">Featured</span>}
          {t.isDemo && <DemoBadge />}
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-1 sm:space-y-2 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="line-clamp-2 font-semibold leading-snug">{t.name}</div>
          {price != null && (
            <div className="shrink-0 text-right leading-tight" title={t.minPrice == null ? "Reported price, not confirmed by the turf" : undefined}>
              <div className={`font-bold ${t.minPrice == null ? "text-slate-600" : ""}`}>{t.minPrice == null ? "~" : ""}{rupees(price)}</div>
              <div className="text-[10px] text-slate-500">{t.minPrice == null ? "reported/hr" : "per hour"}</div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 truncate text-xs text-slate-500 sm:text-sm">
          <MapPin size={13} className="shrink-0" />
          <span className="truncate">{t.locality}{t.locality !== t.city ? `, ${t.city}` : ""}</span>
          {t.distanceKm != null && <span className="shrink-0 font-medium text-slate-700">· {t.distanceKm.toFixed(1)} km</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <AvailabilityBadge mode={t.availabilityMode} updatedAt={t.availabilityUpdatedAt} />
          {t.formats.map((f) => (
            <span key={f} className="chip border-slate-200 text-slate-600">{f}s</span>
          ))}
          {t.ratingCount > 0 && (
            <span className="flex items-center gap-0.5 text-xs font-semibold text-slate-700"><Star size={12} className="fill-amber-400 text-amber-400" /> {t.ratingAvg.toFixed(1)} <span className="font-normal text-slate-400">({t.ratingCount})</span></span>
          )}
        </div>
        <div className="relative z-10 hidden justify-end pt-1 text-sm sm:flex">
          <CompareToggle id={t.id} name={t.name} />
        </div>
      </div>
    </div>
  );
}
