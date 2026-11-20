import type { City, Turf } from "@prisma/client";
import { AMENITIES } from "@/lib/brand";
import { encodeDigipin } from "@/lib/digipin";
import { INDIAN_STATES } from "@/lib/places";
import { DigipinField } from "./DigipinField";

/** Shared turf detail inputs for registration, owner settings and admin "add unclaimed listing". */
export function TurfFields({ cities, turf, city }: { cities: City[]; turf?: Partial<Turf>; city?: { name: string; state: string } | null }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Turf name</label>
        <input name="name" required defaultValue={turf?.name} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Description</label>
        <textarea name="description" rows={3} defaultValue={turf?.description ?? ""} className="input" />
      </div>
      {/* Any town in India: a new one is added the first time a turf there registers */}
      <div>
        <label className="label" htmlFor="tf-town">Town or city</label>
        <input id="tf-town" name="town" required minLength={2} maxLength={60} list="tf-towns" defaultValue={city?.name ?? ""} className="input" placeholder="e.g. Manjeri, Kochi, Pune" autoComplete="address-level2" />
        <datalist id="tf-towns">
          {cities.map((c) => <option key={c.id} value={c.name}>{c.state}</option>)}
        </datalist>
      </div>
      <div>
        <label className="label" htmlFor="tf-state">State</label>
        <select id="tf-state" name="state" required defaultValue={city?.state ?? ""} className="input">
          <option value="" disabled>Choose state</option>
          {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Area / landmark</label>
        <input name="locality" required defaultValue={turf?.locality ?? ""} className="input" placeholder="e.g. Kacherippadi" />
      </div>
      {/* The DIGIPIN replaces the street address and map coordinates: it pinpoints the turf to about 4 m. */}
      <div className="sm:col-span-2">
        <DigipinField defaultValue={turf?.lat != null && turf?.lng != null ? encodeDigipin(turf.lat, turf.lng) : null} />
      </div>
      <div>
        <label className="label">PIN code</label>
        <input name="pincode" required pattern="\d{6}" inputMode="numeric" maxLength={6} defaultValue={turf?.pincode} className="input" />
      </div>
      <div>
        <label className="label">Public phone</label>
        <input name="phone" defaultValue={turf?.phone ?? ""} className="input" />
      </div>
      <div>
        <label className="label">WhatsApp</label>
        <input name="whatsapp" defaultValue={turf?.whatsapp ?? ""} className="input" />
      </div>
      <div>
        <label className="label">Email</label>
        <input name="email" type="email" defaultValue={turf?.email ?? ""} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Amenities</label>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(AMENITIES).map(([k, v]) => (
            <label key={k} className="chip cursor-pointer border-slate-200 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700">
              <input type="checkbox" name="amenities" value={k} defaultChecked={turf?.amenities?.includes(k)} className="hidden" />
              {v}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
