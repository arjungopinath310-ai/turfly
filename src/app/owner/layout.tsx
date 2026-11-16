import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/owner");
  const link = "rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white hover:text-slate-900";
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center gap-1 rounded-2xl bg-slate-100 p-1.5">
        <Link href="/owner" className={link}>Overview</Link>
        <Link href="/owner/calendar" className={link}>Calendar</Link>
        <Link href="/owner/analytics" className={link}>Analytics</Link>
        <Link href="/owner/bookings" className={link}>Bookings</Link>
        <Link href="/owner/turfs" className={link}>My turfs</Link>
        <Link href="/owner/turfs/new" className={`${link} ml-auto`}>+ Register turf</Link>
      </div>
      {children}
    </div>
  );
}
