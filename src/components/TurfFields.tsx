import type { City, Turf } from "@prisma/client";
import { AMENITIES } from "@/lib/brand";

/** Shared turf detail inputs for registration, owner settings and admin "add unclaimed listing". */
export function TurfFields({ cities, turf }: { cities: City[]; turf?: Partial<Turf> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Turf name</label>
        <input name="name" required defaultValue={turf?.name} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Description</label>
        <textarea name="description" rows={3} defaultValue={turf?.description ?? ""} className="input" />
      </div>
      <div>
        <label className="label">City</label>
        <select name="cityId" defaultValue={turf?.cityId} className="input">
          {cities.map((c) => (
            <option key={c.id} value={c.id}>{c.name}, {c.state}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Locality / area</label>
        <input name="locality" defaultValue={turf?.locality ?? ""} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Address</label>
        <input name="addressLine" required defaultValue={turf?.addressLine} className="input" />
      </div>
      <div>
        <label className="label">PIN code</label>
        <input name="pincode" required pattern="\d{6}" defaultValue={turf?.pincode} className="input" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Latitude</label>
          <input name="lat" required type="number" step="any" defaultValue={turf?.lat ?? 11.1203} className="input" />
        </div>
        <div>
          <label className="label">Longitude</label>
          <input name="lng" required type="number" step="any" defaultValue={turf?.lng ?? 76.1199} className="input" />
        </div>
      </div>
      <p className="-mt-2 text-[11px] text-slate-500 sm:col-span-2">Tip: in Google Maps, long-press your pitch and copy the coordinates.</p>
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
      <div>
        <label className="label">Photo URLs (https, space separated)</label>
        <input name="photos" defaultValue={turf?.photos?.join(" ")} className="input" />
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
