"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Star, Trash2 } from "lucide-react";

const MAX_SIDE = 1600; // px; phone photos are shrunk before upload (fast on mobile data, small to store)

async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("Couldn't read that photo"))), "image/jpeg", 0.82));
}

/** Owner / admin: add photos from the phone, pick the cover (thumbnail), remove. Only use photos you took or may use. */
export function TurfPhotoManager({ turfId, initial, max = 8 }: { turfId: string; initial: string[]; max?: number }) {
  const router = useRouter();
  const [photos, setPhotos] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function call(init: RequestInit, query = "") {
    const r = await fetch(`/api/turfs/${turfId}/photos${query}`, init);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "Something went wrong");
    setPhotos(j.photos);
  }

  async function add(files: FileList) {
    setErr(null);
    const list = Array.from(files).slice(0, max - photos.length);
    try {
      for (let i = 0; i < list.length; i++) {
        setBusy(`Uploading ${i + 1} of ${list.length}…`);
        const fd = new FormData();
        fd.append("photo", new File([await shrink(list[i])], "photo.jpg", { type: "image/jpeg" }));
        await call({ method: "POST", body: fd });
      }
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function act(label: string, init: RequestInit, query = "") {
    setErr(null);
    setBusy(label);
    try {
      await call(init, query);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {photos.map((p, i) => (
          <div key={p} className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p} alt="" className="h-full w-full object-cover" />
            {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">Cover</span>}
            <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5">
              {i > 0 && (
                <button type="button" disabled={!!busy} onClick={() => act("Saving…", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ cover: p }) })}
                  className="rounded-lg bg-white/90 p-1.5 text-slate-800" aria-label="Make this the cover photo" title="Make cover"><Star size={14} /></button>
              )}
              <button type="button" disabled={!!busy} onClick={() => confirm("Remove this photo?") && act("Removing…", { method: "DELETE" }, `?url=${encodeURIComponent(p)}`)}
                className="rounded-lg bg-white/90 p-1.5 text-red-600" aria-label="Remove photo" title="Remove"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {photos.length < max && (
          <label className={`grid aspect-[4/3] cursor-pointer place-items-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-center text-sm text-slate-600 hover:border-brand-500 ${busy ? "pointer-events-none opacity-60" : ""}`}>
            <span className="flex flex-col items-center gap-1">
              {busy ? <Loader2 className="animate-spin" size={22} /> : <ImagePlus size={22} />}
              {busy ?? "Add photos"}
            </span>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => e.target.files?.length && add(e.target.files)} />
          </label>
        )}
      </div>
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <p className="text-xs text-slate-500">
        The cover photo is the turf&apos;s thumbnail in search. Use clear photos of the pitch in daylight. Only add photos you took or have permission to use.
      </p>
    </div>
  );
}
