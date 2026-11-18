"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, ClipboardList, Home, LayoutDashboard, MapPin, Search, Shield, Trophy, Users } from "lucide-react";
import type { View } from "@/lib/access";

/** Bottom tab bar on phones (and in the app), with only the signed-in side's main pages. */
type Tab = { href: string; label: string; icon: React.ElementType; exact?: boolean };
const TABS: Record<View, Tab[]> = {
  player: [
    { href: "/", label: "Home", icon: Home, exact: true },
    { href: "/turfs", label: "Turfs", icon: Search },
    { href: "/bookings", label: "Bookings", icon: ClipboardList },
    { href: "/teams", label: "Teams", icon: Trophy },
    { href: "/games", label: "Games", icon: Users },
  ],
  owner: [
    { href: "/owner", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: "/owner/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/owner/bookings", label: "Bookings", icon: ClipboardList },
    { href: "/owner/turfs", label: "My turfs", icon: MapPin },
    { href: "/owner/analytics", label: "Analytics", icon: BarChart3 },
  ],
};

/** Detail and payment screens have their own bottom action bar (Book / Call / Pay) and a back button instead. */
const HIDE_ON = [/^\/turfs\/[^/]+$/, /^\/checkout\//, /^\/split\//];

export function MobileTabBar({ view, admin }: { view: View; admin: boolean }) {
  const path = usePathname() ?? "/";
  if (HIDE_ON.some((r) => r.test(path))) return null;
  const tabs: Tab[] = admin ? [...TABS[view].slice(0, 4), { href: "/admin", label: "Admin", icon: Shield }] : TABS[view];
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden" aria-label="Main">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {tabs.map((t) => {
          const on = t.exact ? path === t.href : path === t.href || path.startsWith(t.href + "/");
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${on ? "text-brand-700" : "text-slate-500"}`}>
              <Icon size={20} strokeWidth={on ? 2.4 : 1.8} />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
