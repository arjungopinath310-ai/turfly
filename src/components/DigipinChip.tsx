"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { formatDigipin } from "@/lib/digipin";

/** The turf's DIGIPIN, shown grouped for reading; tap to copy it (copied as one continuous code). */
export function DigipinChip({ pin, className = "" }: { pin: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(pin);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          /* clipboard blocked: the code is still visible */
        }
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 ${className}`}
      title="DIGIPIN: India Post's digital address for this spot (about 4 m). Tap to copy."
      aria-label={`DIGIPIN ${pin}, tap to copy`}
    >
      <span className="font-semibold text-slate-500">DIGIPIN</span>
      <span className="font-mono font-semibold tracking-wider text-slate-900">{formatDigipin(pin)}</span>
      {copied ? <Check size={13} className="text-brand-600" /> : <Copy size={13} className="text-slate-400" />}
    </button>
  );
}
