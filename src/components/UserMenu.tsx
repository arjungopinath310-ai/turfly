"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { UserRound } from "lucide-react";
import { switchView } from "@/app/actions/view";
import type { View } from "@/lib/access";
import { forgetPushToken } from "./NativeBridge";

export function UserMenu({ name, hasName, role, view, demo = false }: { name: string; hasName: boolean; role: string; view: View; demo?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const path = usePathname();
  const item = "block w-full px-4 py-2.5 text-left hover:bg-slate-50";
  // Only people who run a turf (or admins) can switch sides here; players never see owner options.
  // Demo mode: anyone can try the owner side (they get a private sample turf).
  const canSwitch = role === "OWNER" || role === "ADMIN" || demo;

  // The menu closes on a tap or click anywhere else, on Escape, and when the page changes.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!box.current || box.current.contains(e.target as Node)) return;
      setOpen(false);
      // On touch screens the tap that closes the menu shouldn't also press whatever is under it.
      // (With a mouse the click goes through, as on most websites.)
      if (e.pointerType === "mouse") return;
      const swallow = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 600);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  useEffect(() => {
    setOpen(false);
  }, [path]);

  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium" aria-label="Account menu" aria-expanded={open} aria-haspopup="menu">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
          {hasName ? name.slice(0, 1).toUpperCase() : <UserRound size={15} />}
        </span>
        <span className="hidden max-w-[140px] truncate sm:block">{name}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-card" onClick={() => setOpen(false)}>
          <Link className={item} href="/profile">Profile</Link>
          <Link className={item} href="/messages">Messages</Link>
          <Link className={item} href="/notifications">Notifications</Link>
          {role === "ADMIN" && <Link className={`${item} md:hidden`} href="/admin">Admin</Link>}
          {/* On phones the web footer is hidden for signed-in users, so its links live here. */}
          <div className="border-t border-slate-100 md:hidden">
            <Link className={item} href="/contact">Help &amp; contact</Link>
            <Link className={item} href="/legal/refunds">Cancellation &amp; refunds</Link>
            <Link className={item} href="/legal/terms">Terms &amp; privacy</Link>
          </div>
          {canSwitch && (
            <form action={switchView} className="border-t border-slate-100">
              <input type="hidden" name="to" value={view === "owner" ? "player" : "owner"} />
              <button className={item}>{view === "owner" ? "Switch to player (book a game)" : "Switch to turf owner"}</button>
            </form>
          )}
          <button className="block w-full border-t border-slate-100 px-4 py-2.5 text-left text-red-600 hover:bg-red-50" onClick={async () => { await forgetPushToken(); await signOut({ callbackUrl: "/login" }); }}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
