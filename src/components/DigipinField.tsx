"use client";
import { useState } from "react";
import { Loader2, LocateFixed } from "lucide-react";
import { decodeDigipin, encodeDigipin, formatDigipin, normalizeDigipin } from "@/lib/digipin";

/** Where the turf is, as a DIGIPIN: type it, or stand at the pitch and tap "Use my location". */
export function DigipinField({ defaultValue, required = true }: { defaultValue?: string | null; required?: boolean }) {
  const [value, setValue] = useState(defaultValue ? formatDigipin(defaultValue) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pin = normalizeDigipin(value);
  const pos = pin ? decodeDigipin(pin) : null;

  function locate() {
    setBusy(true);
    setErr(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBusy(false);
        const code = encodeDigipin(p.coords.latitude, p.coords.longitude);
        if (code) setValue(formatDigipin(code));
        else setErr("That location is outside India.");
      },
      () => {
        setBusy(false);
        setErr("Couldn't get your location. Allow location access, or type the DIGIPIN.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  return (
    <div>
      <label className="label" htmlFor="digipin">DIGIPIN (turf location)</label>
      <div className="flex gap-2">
        <input id="digipin" name="digipin" value={value} onChange={(e) => setValue(e.target.value.toUpperCase())} required={required}
          className="input font-mono uppercase tracking-wider" placeholder="e.g. 4T3 96F4 2L7" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={14} />
        <button type="button" onClick={locate} className="btn-ghost shrink-0" disabled={busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <LocateFixed size={15} />} <span className="hidden sm:inline">Use my location</span><span className="sm:hidden">Locate</span>
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        {err ? (
          <span className="text-red-600">{err}</span>
        ) : value && !pin ? (
          <span className="text-red-600">A DIGIPIN has 10 characters: 2–9, C, F, J, K, L, M, P, T.</span>
        ) : pos ? (
          <>✓ Location found. <a className="font-semibold text-brand-700 underline" target="_blank" rel="noopener" href={`https://www.google.com/maps/search/?api=1&query=${pos.lat},${pos.lng}`}>Check it on the map</a></>
        ) : (
          <>Stand on the pitch and tap “Use my location”, or look it up on <a className="underline" target="_blank" rel="noopener" href="https://app.indiapost.gov.in/digipin">India Post DIGIPIN</a>.</>
        )}
      </p>
    </div>
  );
}
