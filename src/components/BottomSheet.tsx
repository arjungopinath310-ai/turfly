"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

/** A phone-style sheet that slides up from the bottom (filters, options). The trigger is a chip or button. */
export function BottomSheet({ label, title, triggerClass, children }: { label: React.ReactNode; title: string; triggerClass: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <>
      <button type="button" className={triggerClass} onClick={() => setOpen(true)} aria-haspopup="dialog">{label}</button>
      {open && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={title}>
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <div className="safe-bottom absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3">
              <div className="text-lg font-bold">{title}</div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={20} /></button>
            </div>
            <div className="p-5 pb-8">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
