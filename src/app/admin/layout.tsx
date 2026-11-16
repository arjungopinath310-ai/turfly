import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "ADMIN") notFound();
  const link = "rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white";
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center gap-1 rounded-2xl bg-slate-900 p-1.5">
        <span className="px-3 text-xs font-bold uppercase tracking-wider text-brand-300">Admin</span>
        <Link href="/admin" className={link}>Overview</Link>
        <Link href="/admin/turfs" className={link}>Turfs & claims</Link>
        <Link href="/admin/finance" className={link}>Payments & disputes</Link>
        <Link href="/admin/users" className={link}>Users</Link>
        <Link href="/admin/settings" className={link}>Fees, policy & offers</Link>
      </div>
      {children}
    </div>
  );
}
