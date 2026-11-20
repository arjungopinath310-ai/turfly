import Link from "next/link";
import { Bell, MessageCircle } from "lucide-react";
import { unreadMessageCount } from "@/lib/chat";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BRAND } from "@/lib/brand";
import { displayName } from "@/lib/format";
import { homeFor } from "@/lib/access";
import { currentView } from "@/lib/view";
import { UserMenu } from "./UserMenu";
import { isDemoMode } from "@/lib/format";

/** Main links for each side. The phone tab bar (MobileTabBar) shows the same destinations. */
export const NAV = {
  player: [
    { href: "/turfs", label: "Find turfs" },
    { href: "/bookings", label: "My bookings" },
    { href: "/teams", label: "Teams" },
    { href: "/games", label: "Join a game" },
  ],
  owner: [
    { href: "/owner", label: "Dashboard" },
    { href: "/owner/calendar", label: "Calendar" },
    { href: "/owner/bookings", label: "Bookings" },
    { href: "/owner/turfs", label: "My turfs" },
    { href: "/owner/analytics", label: "Analytics" },
  ],
};

export async function Navbar() {
  const user = await currentUser().catch(() => null);
  const view = await currentView(user?.role);
  const [unread, unreadChats] = user
    ? await Promise.all([prisma.notification.count({ where: { userId: user.id, readAt: null, NOT: { link: { startsWith: "/messages" } } } }), unreadMessageCount(user.id)])
    : [0, 0];
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link href={user ? homeFor(view) : "/"} className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-700 text-white">⚽</span>
          {BRAND.name}
          {user && view === "owner" && <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Owner</span>}
        </Link>
        {user ? (
          <nav className="hidden items-center gap-4 whitespace-nowrap text-sm font-medium text-slate-600 md:flex lg:gap-5">
            {NAV[view].map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-slate-900">{l.label}</Link>
            ))}
            {user.role === "ADMIN" && <Link href="/admin" className="hover:text-slate-900">Admin</Link>}
          </nav>
        ) : (
          // Signed-out visitors can find turfs; booking and the owner side need an account.
          <nav className="flex items-center gap-4 whitespace-nowrap text-sm font-medium text-slate-600">
            <Link href="/turfs" className="hover:text-slate-900">Find turfs</Link>
            <Link href="/signup?as=owner" className="hidden hover:text-slate-900 sm:inline">List your turf</Link>
            <Link href="/about" className="hidden hover:text-slate-900 md:inline">About</Link>
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
              <UserMenu name={displayName(user)} hasName={Boolean(user.name?.trim())} role={user.role} view={view} demo={isDemoMode()} />
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost btn-sm whitespace-nowrap">Sign in</Link>
              <Link href="/signup" className="btn-primary btn-sm whitespace-nowrap">Sign up<span className="hidden sm:inline">&nbsp;free</span></Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
