"use client";
/** Picks an image and downsizes it client-side to ≤256px JPEG data URL (keeps uploads tiny; no storage bucket needed). */
export function ImagePicker({ value, onChange, label = "Upload", round = false }: { value: string | null; onChange: (v: string | null) => void; label?: string; round?: boolean }) {
  async function pick(file: File) {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 256 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    onChange(c.toDataURL("image/jpeg", 0.85));
  }
  return (
    <div className="flex items-center gap-3">
      <div className={`grid h-14 w-14 place-items-center overflow-hidden border border-slate-200 bg-slate-50 text-xl ${round ? "rounded-full" : "rounded-xl"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : "🛡️"}
      </div>
      <label className="btn-ghost btn-sm cursor-pointer">
        {label}
        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
      </label>
      {value && <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => onChange(null)}>Remove</button>}
    </div>
  );
}
