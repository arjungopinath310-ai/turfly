"use client";
import Link from "next/link";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { UserRound } from "lucide-react";
import { switchView } from "@/app/actions/view";
import type { View } from "@/lib/access";
import { forgetPushToken } from "./NativeBridge";

export function UserMenu({ name, hasName, role, view }: { name: string; hasName: boolean; role: string; view: View }) {
  const [open, setOpen] = useState(false);
  const item = "block w-full px-4 py-2.5 text-left hover:bg-slate-50";
  // Only people who run a turf (or admins) can switch sides here; players never see owner options.
  const canSwitch = role === "OWNER" || role === "ADMIN";
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium" aria-label="Account menu" aria-expanded={open}>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
          {hasName ? name.slice(0, 1).toUpperCase() : <UserRound size={15} />}
        </span>
        <span className="hidden max-w-[140px] truncate sm:block">{name}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-card" onClick={() => setOpen(false)}>
          <Link className={item} href="/profile">Profile</Link>
          <Link className={item} href="/messages">Messages</Link>
          <Link className={item} href="/notifications">Notifications</Link>
          {role === "ADMIN" && <Link className={`${item} md:hidden`} href="/admin">Admin</Link>}
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
