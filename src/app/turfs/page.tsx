import { prisma } from "@/lib/db";
import { searchTurfs, type TurfFilters } from "@/lib/search";
import { AMENITIES } from "@/lib/brand";
import { TurfResults } from "@/components/TurfResults";
import { CompareBar } from "@/components/CompareBar";
import { LocateButton } from "@/components/LocateButton";

export default async function TurfsPage({ searchParams: sp }: { searchParams: TurfFilters & { amenity?: string | string[] } }) {
  const amenity = sp.amenity ? ([] as string[]).concat(sp.amenity).join(",") : undefined;
  const searchParams: TurfFilters = { ...sp, amenities: sp.amenities ?? amenity };
  const [cities, rows] = await Promise.all([prisma.city.findMany({ where: { isActive: true } }), searchTurfs(searchParams)]);
  const city = cities.find((c) => c.slug === (searchParams.city ?? "manjeri")) ?? cities[0];
  const sel = new Set((searchParams.amenities ?? "").split(",").filter(Boolean));
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="h1">Football turfs{city ? ` in ${city.name}` : ""}</h1>
        <p className="muted">{rows.length} result{rows.length === 1 ? "" : "s"}. Only turfs marked “Live availability” can be booked online instantly.</p>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <form className="card h-fit space-y-4 p-4 lg:sticky lg:top-20">
          <div>
            <label className="label">Search</label>
            <input name="q" defaultValue={searchParams.q} className="input" placeholder="Name, area or PIN" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">City</label>
              <select name="city" defaultValue={searchParams.city ?? "manjeri"} className="input">
                {cities.map((c) => (
                  <option key={c.id} value={c.slug}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">PIN code</label>
              <input name="pincode" defaultValue={searchParams.pincode} className="input" inputMode="numeric" maxLength={6} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Format</label>
              <select name="format" defaultValue={searchParams.format ?? ""} className="input">
                <option value="">Any</option>
                <option value="5">5-a-side</option>
                <option value="7">7-a-side</option>
              </select>
            </div>
            <div>
              <label className="label">Max ₹ / hr</label>
              <input name="maxPrice" type="number" min={0} step={100} defaultValue={searchParams.maxPrice} className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Free on</label>
              <input name="date" type="date" defaultValue={searchParams.date} className="input" />
            </div>
            <div>
              <label className="label">At</label>
              <input name="time" type="time" step={1800} defaultValue={searchParams.time} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Min rating</label>
            <select name="minRating" defaultValue={searchParams.minRating ?? ""} className="input">
              <option value="">Any</option>
              <option value="3">3★+</option>
              <option value="4">4★+</option>
            </select>
          </div>
          <div>
            <label className="label">Amenities</label>
            <AmenityPicker selected={Array.from(sel)} />
          </div>
          <div>
            <label className="label">Near me</label>
            <LocateButton lat={searchParams.lat} lng={searchParams.lng} radius={searchParams.radius} />
          </div>
          <div>
            <label className="label">Sort</label>
            <select name="sort" defaultValue={searchParams.sort ?? ""} className="input">
              <option value="">Best match</option>
              <option value="distance">Distance</option>
              <option value="price">Price</option>
              <option value="rating">Rating</option>
            </select>
          </div>
          <button className="btn-primary w-full">Apply filters</button>
        </form>
        <TurfResults rows={rows} center={city ? { lat: city.lat, lng: city.lng } : { lat: 11.12, lng: 76.12 }} />
      </div>
      <CompareBar />
    </div>
  );
}

function AmenityPicker({ selected }: { selected: string[] }) {
  // Each checked box posts `amenity`; the page joins them into the `amenities` filter.
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(AMENITIES).map(([k, v]) => (
        <label key={k} className="chip cursor-pointer border-slate-200 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700">
          <input type="checkbox" name="amenity" value={k} defaultChecked={selected.includes(k)} className="hidden" />
          {v}
        </label>
      ))}
    </div>
  );
}
