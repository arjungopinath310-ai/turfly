import Link from "next/link";
import { MapPin } from "lucide-react";
import type { TurfCard } from "@/lib/search";
import { rupees } from "@/lib/engine/pricing";
import { AvailabilityBadge, DemoBadge, Stars } from "./ui";
import { CompareToggle } from "./CompareBar";

export function TurfCardView({ t }: { t: TurfCard }) {
  return (
    <div className="card group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
      <Link href={`/turfs/${t.slug}`} className="block">
        <div className="relative aspect-[16/9] bg-gradient-to-br from-brand-700 to-brand-950">
          {t.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.photo} alt={t.name} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="grid h-full place-items-center text-5xl opacity-60">⚽</div>
          )}
          <div className="absolute left-3 top-3 flex gap-1.5">
            {t.isFeatured && <span className="chip border-amber-300 bg-amber-100 text-amber-800">Featured</span>}
            {t.isDemo && <DemoBadge />}
          </div>
        </div>
      </Link>
      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/turfs/${t.slug}`} className="font-semibold leading-tight hover:underline">{t.name}</Link>
          {t.minPrice != null ? (
            <div className="shrink-0 text-right">
              <div className="font-bold">{rupees(t.minPrice)}</div>
              <div className="text-[11px] text-slate-500">from / hour</div>
            </div>
          ) : (
            t.reportedPriceFrom != null && (
              <div className="shrink-0 text-right" title="Reported price, not confirmed by the turf">
                <div className="font-bold text-slate-600">~{rupees(t.reportedPriceFrom)}</div>
                <div className="text-[11px] text-slate-500">reported / hour</div>
              </div>
            )
          )}
        </div>
        <div className="flex items-center gap-1 text-sm text-slate-500">
          <MapPin size={14} /> {t.locality}
          {t.distanceKm != null && <span>· {t.distanceKm.toFixed(1)} km</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <AvailabilityBadge mode={t.availabilityMode} updatedAt={t.availabilityUpdatedAt} />
          {t.formats.map((f) => (
            <span key={f} className="chip border-slate-200 text-slate-600">{f}-a-side</span>
          ))}
        </div>
        <div className="flex items-center justify-between pt-1 text-sm">
          {t.ratingCount > 0 ? (
            <span className="flex items-center gap-1"><Stars value={t.ratingAvg} /> <span className="text-slate-500">({t.ratingCount})</span></span>
          ) : (
            <span className="text-slate-400">No reviews yet</span>
          )}
          <CompareToggle id={t.id} name={t.name} />
        </div>
      </div>
    </div>
  );
}
