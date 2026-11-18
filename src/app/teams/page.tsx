import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Empty, PageHeader } from "@/components/ui";
import { CreateTeam } from "@/components/CreateTeam";

export default async function TeamsPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/teams");
  const [owned, memberOf] = await Promise.all([
    prisma.team.findMany({
      where: { ownerId: user.id, archived: false },
      include: { _count: { select: { members: { where: { status: { not: "REMOVED" } } }, bookings: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.teamMember.findMany({ where: { userId: user.id, status: "ACTIVE", team: { ownerId: { not: user.id }, archived: false } }, include: { team: true } }),
  ]);
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader title="Teams" subtitle="Create squads once, reuse them for every booking." />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {owned.length === 0 && <Empty title="No teams yet">Create your first team. Players don&apos;t need an account to be added.</Empty>}
          {owned.map((t) => (
            <Link key={t.id} href={`/teams/${t.id}`} className="card flex items-center gap-4 p-4 transition hover:shadow-lg">
              <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl bg-brand-50 text-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {t.logoUrl ? <img src={t.logoUrl} alt="" className="h-full w-full object-cover" /> : "🛡️"}
              </div>
              <div className="flex-1">
                <div className="font-semibold">{t.name}</div>
                <div className="text-sm text-slate-500">{t.playersPerSide}-a-side · {t._count.members} player{t._count.members === 1 ? "" : "s"} · {t._count.bookings} match{t._count.bookings === 1 ? "" : "es"}</div>
              </div>
              <span className="text-sm text-brand-700">Manage →</span>
            </Link>
          ))}
          {memberOf.length > 0 && (
            <>
              <h2 className="h2 pt-6">Teams you play for</h2>
              {memberOf.map((m) => (
                <Link key={m.id} href={`/teams/${m.teamId}`} className="card block p-4">
                  <div className="font-semibold">{m.team.name}</div>
                  <div className="text-sm text-slate-500">{m.team.playersPerSide}-a-side{m.isCaptain ? " · You're captain" : ""}</div>
                </Link>
              ))}
            </>
          )}
        </div>
        <CreateTeam />
      </div>
    </div>
  );
}
