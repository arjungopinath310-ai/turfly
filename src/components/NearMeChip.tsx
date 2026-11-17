"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LocateFixed } from "lucide-react";

/** One-tap "Near me": asks for location (only when tapped) and sorts turfs by distance. Tap again to turn off. */
export function NearMeChip({ active, onHref, offHref, className }: { active: boolean; onHref: string; offHref: string; className: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  return (
    <button
      type="button"
      className={className}
      aria-pressed={active}
      onClick={() => {
        if (active) return router.push(offHref);
        setBusy(true);
        setErr(false);
        navigator.geolocation.getCurrentPosition(
          (p) => router.push(onHref.replace("__LAT__", p.coords.latitude.toFixed(5)).replace("__LNG__", p.coords.longitude.toFixed(5))),
          () => { setBusy(false); setErr(true); },
          { enableHighAccuracy: false, timeout: 8000 },
        );
      }}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <LocateFixed size={14} />} {err ? "Location off" : "Near me"}
    </button>
  );
}
