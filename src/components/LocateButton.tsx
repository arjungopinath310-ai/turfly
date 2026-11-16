"use client";
import { useState } from "react";
import { LocateFixed } from "lucide-react";

/** Fills hidden lat/lng inputs from the browser's geolocation (only after the user clicks). */
export function LocateButton({ lat, lng, radius }: { lat?: string; lng?: string; radius?: string }) {
  const [pos, setPos] = useState(lat && lng ? { lat, lng } : null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <input type="hidden" name="lat" value={pos?.lat ?? ""} />
      <input type="hidden" name="lng" value={pos?.lng ?? ""} />
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-ghost flex-1"
          onClick={() =>
            navigator.geolocation.getCurrentPosition(
              (p) => setPos({ lat: p.coords.latitude.toFixed(5), lng: p.coords.longitude.toFixed(5) }),
              () => setErr("Location permission denied"),
              { enableHighAccuracy: false, timeout: 8000 },
            )
          }
        >
          <LocateFixed size={15} /> {pos ? "Located ✓" : "Use my location"}
        </button>
        <select name="radius" defaultValue={radius ?? ""} className="input w-24">
          <option value="">Any</option>
          <option value="3">3 km</option>
          <option value="5">5 km</option>
          <option value="10">10 km</option>
          <option value="25">25 km</option>
        </select>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
