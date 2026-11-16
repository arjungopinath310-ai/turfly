import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatIst } from "@/lib/time";
import { Empty, PageHeader } from "@/components/ui";
import { MarkRead } from "@/components/MarkRead";

export default async function Notifications() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/notifications");
  const items = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <PageHeader title="Notifications">{items.some((i) => !i.readAt) && <MarkRead />}</PageHeader>
      {items.length === 0 ? (
        <Empty title="You're all caught up" />
      ) : (
        <div className="card divide-y divide-slate-100">
          {items.map((n) => {
            const body = (
              <div className={`p-4 ${n.readAt ? "" : "bg-brand-50/40"}`}>
                <div className="flex justify-between gap-3">
                  <span className="font-semibold">{n.title}</span>
                  <span className="shrink-0 text-xs text-slate-400">{formatIst(n.createdAt)}</span>
                </div>
                <p className="text-sm text-slate-600">{n.body}</p>
              </div>
            );
            return n.link ? <Link key={n.id} href={n.link} className="block hover:bg-slate-50">{body}</Link> : <div key={n.id}>{body}</div>;
          })}
        </div>
      )}
    </div>
  );
}
