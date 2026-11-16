import Link from "next/link";
import { Bell, MessageCircle } from "lucide-react";
import { unreadMessageCount } from "@/lib/chat";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BRAND } from "@/lib/brand";
import { displayName } from "@/lib/format";
import { UserMenu } from "./UserMenu";

export async function Navbar() {
  const user = await currentUser().catch(() => null);
  const [unread, unreadChats] = user
    ? await Promise.all([prisma.notification.count({ where: { userId: user.id, readAt: null, NOT: { link: { startsWith: "/messages" } } } }), unreadMessageCount(user.id)])
    : [0, 0];
  const isOwner = user && (user.role === "OWNER" || user.role === "ADMIN");
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-700 text-white">⚽</span>
          {BRAND.name}
        </Link>
        {/* Signed-out visitors only get "About" and "Sign in": every app page needs an account. */}
        {user ? (
          <nav className="hidden items-center gap-5 text-sm font-medium text-slate-600 md:flex">
            <Link href="/turfs" className="hover:text-slate-900">Find turfs</Link>
            <Link href="/find-players" className="hover:text-slate-900">Find players</Link>
            <Link href="/teams" className="hover:text-slate-900">Teams</Link>
            <Link href="/bookings" className="hover:text-slate-900">My bookings</Link>
            {isOwner && <Link href="/owner" className="hover:text-slate-900">Owner</Link>}
            {user.role === "ADMIN" && <Link href="/admin" className="hover:text-slate-900">Admin</Link>}
          </nav>
        ) : (
          <nav className="flex items-center text-sm font-medium text-slate-600">
            <Link href="/about" className="hover:text-slate-900">About</Link>
          </nav>
        )}
        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <Link href="/messages" className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={`Messages${unreadChats ? ` (${unreadChats} unread)` : ""}`}>
                <MessageCircle size={18} />
                {unreadChats > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[9px] font-bold text-white">{unreadChats > 9 ? "9+" : unreadChats}</span>}
              </Link>
              <Link href="/notifications" className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Notifications">
                <Bell size={18} />
                {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />}
              </Link>
              <UserMenu name={displayName(user)} hasName={Boolean(user.name?.trim())} role={user.role} />
            </>
          ) : (
            <Link href="/login" className="btn-primary">Sign in</Link>
          )}
        </div>
      </div>
    </header>
  );
}
