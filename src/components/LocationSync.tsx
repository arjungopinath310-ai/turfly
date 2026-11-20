"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LocateFixed, MapPinOff } from "lucide-react";
import { formatLoc, LOC_COOKIE, LOC_FRESH_MS, LOC_MAX_AGE, parseLoc } from "@/lib/geo";

const DENIED = "turfly_loc_denied";
const readCookie = () => parseLoc(document.cookie.split("; ").find((c) => c.startsWith(`${LOC_COOKIE}=`))?.slice(LOC_COOKIE.length + 1));
const movedKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 109);

/**
 * Keeps the "near you" lists current from the phone's GPS. With `ask`, it asks for location on its own the
 * first time (the home page); otherwise it only refreshes a position the person already shared.
 * The position stays on the device (a cookie); the page re-renders with the nearest turfs.
 */
export function LocationSync({ active, ask = false, quiet = false, className = "" }: { active: boolean; ask?: boolean; quiet?: boolean; className?: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "denied" | "unsupported">("idle");

  const locate = useCallback(
    (quiet: boolean) => {
      if (!("geolocation" in navigator)) return setState("unsupported");
      if (!quiet) setState("busy");
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const before = readCookie();
          const { latitude: lat, longitude: lng } = p.coords;
          document.cookie = `${LOC_COOKIE}=${encodeURIComponent(formatLoc(lat, lng))}; Path=/; Max-Age=${LOC_MAX_AGE}; SameSite=Lax`;
          try { sessionStorage.removeItem(DENIED); } catch {}
          setState("idle");
          if (!before || !active || movedKm(before, { lat, lng }) > 0.3) router.refresh();
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            try { sessionStorage.setItem(DENIED, "1"); } catch {}
            setState("denied");
          } else setState("idle");
        },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
      );
    },
    [active, router],
  );

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const saved = readCookie();
    if (saved && Date.now() - saved.at < LOC_FRESH_MS) return;
    let denied = false;
    try { denied = sessionStorage.getItem(DENIED) === "1"; } catch {}
    if (denied) return setState("denied");
    if (saved || ask) locate(true);
  }, [ask, locate]);

  if (state === "unsupported" || quiet) return null;
  return (
    <button type="button" onClick={() => locate(false)} disabled={state === "busy"} className={`chip shrink-0 whitespace-nowrap ${active ? "border-brand-200 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-700"} ${className}`}>
      {state === "busy" ? <Loader2 size={13} className="animate-spin" /> : state === "denied" ? <MapPinOff size={13} /> : <LocateFixed size={13} />}
      {state === "denied" ? "Location is off · tap to retry" : active ? "Near you · update" : "Use my location"}
    </button>
  );
}
