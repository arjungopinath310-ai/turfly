import Link from "next/link";
import { cookies } from "next/headers";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { prisma } from "@/lib/db";
import { freeToday, searchTurfs, type TurfFilters } from "@/lib/search";
import { LOC_COOKIE, parseLoc } from "@/lib/geo";
import { LocationSync } from "@/components/LocationSync";
import { AMENITIES } from "@/lib/brand";
import { TurfResults } from "@/components/TurfResults";
import { CompareBar } from "@/components/CompareBar";
import { LocateButton } from "@/components/LocateButton";
import { NearMeChip } from "@/components/NearMeChip";
import { BottomSheet } from "@/components/BottomSheet";

type SP = TurfFilters & { amenity?: string | string[]; page?: string };
type City = { id: string; slug: string; name: string; lat: number; lng: number };

const chip = "chip shrink-0 whitespace-nowrap px-3 py-1.5 text-[13px]";
const chipOff = `${chip} border-slate-200 bg-white text-slate-700`;
const chipOn = `${chip} border-brand-600 bg-brand-600 text-white`;

/** Search: results first. Quick filter chips on top (like booking apps), the full form folded under "Filters". */
export default async function TurfsPage(props: { searchParams: Promise<SP> }) {
  const sp = await props.searchParams;
  const amenity = sp.amenity ? ([] as string[]).concat(sp.amenity).join(",") : undefined;
  const { page: pageParam, amenity: _a, ...filters } = sp;
  const f: TurfFilters = { ...filters, amenities: sp.amenities ?? amenity };
  // The phone's saved location (if shared): show distances, and sort nearest first unless another sort was picked
  const saved = f.lat && f.lng ? null : parseLoc((await cookies()).get(LOC_COOKIE)?.value);
  const searchF: TurfFilters = saved ? { ...f, lat: String(saved.lat), lng: String(saved.lng), sort: f.sort ?? "distance" } : f;
  const nearOn = Boolean(f.lat && f.lng) || Boolean(saved && searchF.sort === "distance");
  const [cities, res] = await Promise.all([
    prisma.city.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    // the demo turf leads the list (sales), except when someone searches for a name
    searchTurfs(searchF, { page: Number(pageParam) || 1, pinDemo: !f.q }),
  ]);
  const free = await freeToday(res.cards);
  const city = cities.find((c) => c.slug === f.city);
  const amen = new Set((f.amenities ?? "").split(",").filter(Boolean));

  // Links that change one filter and keep the rest.
  const base: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) if (typeof v === "string" && v) base[k] = v;
  // Changing a filter starts again at page 1 ("page" is never part of base).
  const href = (changes: Record<string, string | null>) => {
    const p = new URLSearchParams(base);
    for (const [k, v] of Object.entries(changes)) (v ? p.set(k, v) : p.delete(k));
    const s = p.toString();
    return `/turfs${s ? `?${s}` : ""}`;
  };
  const toggleAmenity = (a: string) => {
    const next = new Set(amen);
    if (next.has(a)) next.delete(a);
    else next.add(a);
    return href({ amenities: Array.from(next).join(",") || null });
  };
  // Filters only reachable in the sheet (the chips show their own state).
  const advanced = ["city", "pincode", "maxPrice", "minRating", "date", "time"].filter((k) => base[k]).length + Array.from(amen).filter((a) => a !== "floodlights" && a !== "parking").length;
  const anyFilter = Object.keys(base).length > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 sm:py-8">
      <form className="flex gap-2" role="search">
        {Object.entries(base).filter(([k]) => k !== "q").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input name="q" defaultValue={f.q} className="input pl-9" placeholder="Search by turf name" aria-label="Search by turf name" />
        </div>
        <button className="btn-primary">Search</button>
      </form>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <div className="shrink-0 lg:hidden">
          <BottomSheet title="Filters" triggerClass={advanced ? chipOn : chipOff} label={<><SlidersHorizontal size={14} /> Filters{advanced ? ` · ${advanced}` : ""}</>}>
            <FilterForm f={f} cities={cities} amen={amen} />
            {anyFilter && <Link href="/turfs" className="mt-3 block text-center text-sm font-semibold text-slate-500">Clear all filters</Link>}
          </BottomSheet>
        </div>
        <NearMeChip active={nearOn} className={nearOn ? chipOn : chipOff}
          onHref={href({ lat: "__LAT__", lng: "__LNG__", sort: "distance" })} offHref={href({ lat: null, lng: null, radius: null, sort: saved ? "best" : null })} />
        <Link href={href({ bookable: f.bookable === "1" ? null : "1" })} className={f.bookable === "1" ? chipOn : chipOff}>Book online</Link>
        <Link href={href({ format: f.format === "5" ? null : "5" })} className={f.format === "5" ? chipOn : chipOff}>5-a-side</Link>
        <Link href={href({ format: f.format === "7" ? null : "7" })} className={f.format === "7" ? chipOn : chipOff}>7-a-side</Link>
        <Link href={toggleAmenity("floodlights")} className={amen.has("floodlights") ? chipOn : chipOff}>Floodlights</Link>
        <Link href={toggleAmenity("parking")} className={amen.has("parking") ? chipOn : chipOff}>Parking</Link>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <div className="card hidden h-fit p-4 lg:sticky lg:top-20 lg:block">
          <FilterForm f={f} cities={cities} amen={amen} />
        </div>
        <TurfResults
          rows={res.cards}
          points={res.points}
          free={free}
          center={city ? { lat: city.lat, lng: city.lng } : searchF.lat && searchF.lng ? { lat: Number(searchF.lat), lng: Number(searchF.lng) } : { lat: 22.5, lng: 79 }}
          zoom={city || (searchF.lat && searchF.lng) ? 12 : 5}
          footer={
            res.pageCount > 1 && (
              <nav className="mt-5 flex items-center justify-between gap-2" aria-label="Pages">
                {res.page > 1 ? <Link href={href({ page: String(res.page - 1) })} className="btn-ghost">← Previous</Link> : <span />}
                <span className="text-sm text-slate-500">Page {res.page} of {res.pageCount}</span>
                {res.page < res.pageCount ? <Link href={href({ page: String(res.page + 1) })} className="btn-primary">Next →</Link> : <span />}
              </nav>
            )
          }
          header={
            <div className="flex items-baseline gap-3">
              <h1 className="truncate text-lg font-bold tracking-tight sm:text-2xl">{res.total} turf{res.total === 1 ? "" : "s"}{city ? ` in ${city.name}` : ""}</h1>
              {nearOn && !city && <span className="hidden shrink-0 text-sm text-slate-500 sm:inline">nearest first</span>}
              {anyFilter && <Link href="/turfs" className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-slate-500 hover:text-slate-800"><X size={14} /> Clear</Link>}
            </div>
          }
        />
      </div>
      <CompareBar />
      {/* refreshes a location the person already shared, so "nearest first" follows them */}
      <LocationSync active={Boolean(saved)} quiet />
    </div>
  );
}

function FilterForm({ f, cities, amen }: { f: TurfFilters; cities: City[]; amen: Set<string> }) {
  return (
    <form className="space-y-4">
      {f.q && <input type="hidden" name="q" value={f.q} />}
      {f.bookable && <input type="hidden" name="bookable" value={f.bookable} />}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Town</label>
          <select name="city" defaultValue={f.city ?? ""} className="input">
            <option value="">All towns</option>
            {cities.map((c) => (
              <option key={c.id} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">PIN code</label>
          <input name="pincode" defaultValue={f.pincode} className="input" inputMode="numeric" maxLength={6} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Format</label>
          <select name="format" defaultValue={f.format ?? ""} className="input">
            <option value="">Any</option>
            <option value="5">5-a-side</option>
            <option value="7">7-a-side</option>
          </select>
        </div>
        <div>
          <label className="label">Max ₹ / hour</label>
          <input name="maxPrice" type="number" min={0} step={100} defaultValue={f.maxPrice} className="input" inputMode="numeric" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Free on</label>
          <input name="date" type="date" defaultValue={f.date} className="input" />
        </div>
        <div>
          <label className="label">At</label>
          <input name="time" type="time" step={1800} defaultValue={f.time} className="input" />
        </div>
      </div>
      <div>
        <label className="label">Facilities</label>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(AMENITIES).map(([k, v]) => (
            <label key={k} className="chip cursor-pointer border-slate-200 px-3 py-1.5 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700">
              <input type="checkbox" name="amenity" value={k} defaultChecked={amen.has(k)} className="hidden" />
              {v}
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Near me</label>
        <LocateButton lat={f.lat} lng={f.lng} radius={f.radius} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Min rating</label>
          <select name="minRating" defaultValue={f.minRating ?? ""} className="input">
            <option value="">Any</option>
            <option value="3">3★+</option>
            <option value="4">4★+</option>
          </select>
        </div>
        <div>
          <label className="label">Sort</label>
          <select name="sort" defaultValue={f.sort ?? ""} className="input">
            <option value="">Best match</option>
            <option value="distance">Distance</option>
            <option value="price">Price</option>
            <option value="rating">Rating</option>
          </select>
        </div>
      </div>
      <button className="btn-primary w-full py-3">Show turfs</button>
    </form>
  );
}
