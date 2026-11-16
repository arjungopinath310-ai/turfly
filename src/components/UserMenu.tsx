"use client";
import Link from "next/link";
import { useState } from "react";
import { signOut } from "next-auth/react";

export function UserMenu({ name, role }: { name: string; role: string }) {
  const [open, setOpen] = useState(false);
  const item = "block px-4 py-2 hover:bg-slate-50";
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">{name.slice(0, 1).toUpperCase()}</span>
        <span className="hidden max-w-[120px] truncate sm:block">{name}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-card" onClick={() => setOpen(false)}>
          <Link className={item} href="/profile">Profile</Link>
          <Link className={`${item} md:hidden`} href="/turfs">Find turfs</Link>
          <Link className={`${item} md:hidden`} href="/bookings">My bookings</Link>
          <Link className={`${item} md:hidden`} href="/teams">Teams</Link>
          <Link className={`${item} md:hidden`} href="/find-players">Find players</Link>
          <Link className={item} href="/owner">{role === "PLAYER" ? "List your turf" : "Owner dashboard"}</Link>
          {role === "ADMIN" && <Link className={item} href="/admin">Admin</Link>}
          <button className="block w-full px-4 py-2 text-left text-red-600 hover:bg-red-50" onClick={() => signOut({ callbackUrl: "/" })}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
