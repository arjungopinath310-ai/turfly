"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Camera, Loader2 } from "lucide-react";

/** "Add a photo" on a listed turf: anyone signed in can help; it shows after a quick check. */
export function AddTurfPhoto({ turfId, slug, signedIn, hasPhotos }: { turfId: string; slug: string; signedIn: boolean; hasPhotos: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);
  const label = hasPhotos ? "Add a photo" : "Be the first to add a photo";
  if (!signedIn)
    return (
      <Link href={`/login?next=${encodeURIComponent(`/turfs/${slug}`)}`} className="btn-ghost btn-sm shrink-0"><Camera size={14} /> {label}</Link>
    );
  return (
    <span className="inline-flex flex-col">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setErr(null);
          setState("busy");
          const fd = new FormData();
          fd.append("photo", f);
          try {
            const r = await fetch(`/api/turfs/${turfId}/photo-suggestions`, { method: "POST", body: fd });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.error ?? "Couldn't upload that photo");
            setState("done");
          } catch (x) {
            setErr((x as Error).message);
            setState("idle");
          }
        }}
      />
      <button type="button" disabled={state === "busy"} onClick={() => input.current?.click()} className="btn-ghost btn-sm shrink-0">
        {state === "busy" ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} {state === "done" ? "Thanks! Add another" : label}
      </button>
      {state === "done" && <span className="mt-1 text-xs text-brand-700">Thanks! Your photo shows here after a quick check.</span>}
      {err && <span className="mt-1 text-xs text-red-600">{err}</span>}
    </span>
  );
}
