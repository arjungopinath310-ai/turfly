"use client";
import { useCallback, useEffect, useState } from "react";
import { Loader2, LocateFixed, MapPinOff } from "lucide-react";
import { formatLoc, LOC_COOKIE, LOC_FRESH_MS, LOC_MAX_AGE, parseLoc } from "@/lib/geo";
import { useRefreshingRouter } from "./ActionForm";

const DENIED = "turfly_loc_denied";
const readCookie = () => parseLoc(document.cookie.split("; ").find((c) => c.startsWith(`${LOC_COOKIE}=`))?.slice(LOC_COOKIE.length + 1));
const movedKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 109);

/**
 * Keeps the "near you" lists current from the phone's GPS. With `ask`, it asks for location on its own the
 * first time (the home page); otherwise it only refreshes a position the person already shared.
 * The position stays on the device (a cookie); the page re-renders with the nearest turfs.
 */
export function LocationSync({ active, ask = false, quiet = false, className = "", label, tone = "light" }: { active: boolean; ask?: boolean; quiet?: boolean; className?: string; label?: string; tone?: "light" | "dark" }) {
  const { refresh } = useRefreshingRouter();
  const [state, setState] = useState<"idle" | "busy" | "denied" | "unsupported">("idle");
  const [finding, setFinding] = useState(false);

  // Ask the server to list the turfs in this area from the public map (once per area per visit); refresh when it adds some.
  const discover = useCallback(
    async (lat: number, lng: number) => {
      const key = `turfly_disc_${Math.floor(lat * 10)}_${Math.floor(lng * 10)}`;
      try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
      } catch {}
      setFinding(true);
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          const r = await fetch("/api/turfs/discover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lat, lng }) });
          const j = (await r.json().catch(() => ({}))) as { status?: string; added?: number };
          // after a slow lookup the answer may be "cached" (it finished in between): refresh then too
          if ((j.added ?? 0) > 0 || (attempt > 0 && j.status === "cached")) refresh();
          if (j.status !== "pending") break;
          await new Promise((res) => setTimeout(res, 15_000));
        }
      } catch {
        // offline or the map servers are busy: the list simply shows what Turfly already has
      } finally {
        setFinding(false);
      }
    },
    [refresh],
  );

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
          if (!before || !active || movedKm(before, { lat, lng }) > 0.3) refresh();
          discover(lat, lng);
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
    [active, refresh, discover],
  );

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const saved = readCookie();
    if (saved) discover(saved.lat, saved.lng);
    if (saved && Date.now() - saved.at < LOC_FRESH_MS) return;
    let denied = false;
    try { denied = sessionStorage.getItem(DENIED) === "1"; } catch {}
    if (denied) return setState("denied");
    if (saved || ask) locate(true);
  }, [ask, locate, discover]);

  if (state === "unsupported" || quiet) return null;
  return (
    <button type="button" onClick={() => locate(false)} disabled={state === "busy"} className={`chip shrink-0 whitespace-nowrap ${tone === "dark" ? "border-volt/60 py-1 font-display text-[13px] uppercase tracking-[.08em] text-volt hover:bg-volt hover:text-ink" : active ? "border-brand-200 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-700"} ${className}`}>
      {state === "busy" || finding ? <Loader2 size={13} className="animate-spin" /> : state === "denied" ? <MapPinOff size={13} /> : <LocateFixed size={13} />}
      {state === "denied" ? "Location is off · tap to retry" : finding ? "Finding turfs near you…" : active ? (label ?? "Near you · update") : "Use my location"}
    </button>
  );
}
