import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publicMember } from "@/lib/teams";
import { teamInviteUrl } from "@/lib/share";
import { formatDateLong, formatTimeRange } from "@/lib/time";
import { StatusBadge } from "@/components/ui";
import { TeamEditor } from "@/components/TeamEditor";

export default async function TeamPage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) redirect(`/login?next=/teams/${params.id}`);
  const team = await prisma.team.findUnique({
    where: { id: params.id },
    include: {
      members: { where: { status: { not: "REMOVED" } }, orderBy: [{ isCaptain: "desc" }, { createdAt: "asc" }], include: { user: { select: { shareContactWithTeams: true } } } },
      history: { orderBy: { createdAt: "desc" }, take: 20 },
      bookings: { where: { status: { in: ["CONFIRMED", "COMPLETED"] } }, orderBy: { startAt: "desc" }, take: 20, include: { turf: { select: { name: true } }, result: true } },
    },
  });
  if (!team) notFound();
  const isOwner = team.ownerId === user.id;
  const isMember = team.members.some((m) => m.userId === user.id);
  if (!isOwner && !isMember) notFound();
  const members = team.members.map((m) => publicMember(m, isOwner, user.id));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/teams" className="text-sm text-slate-500 hover:underline">← Teams</Link>
      <TeamEditor
        team={{ id: team.id, name: team.name, playersPerSide: team.playersPerSide, logoUrl: team.logoUrl }}
        members={members}
        isOwner={isOwner}
        inviteUrl={isOwner ? teamInviteUrl(team.inviteToken) : null}
      />
      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="h2 mb-3">Match history</h2>
          <ul className="space-y-2 text-sm">
            {team.bookings.map((b) => (
              <li key={b.id} className="flex items-center justify-between">
                <span>
                  {formatDateLong(b.startAt)} · {formatTimeRange(b.startAt, b.endAt)}
                  <span className="block text-xs text-slate-500">{b.turf.name}{b.result ? ` · ${b.result.ourScore}–${b.result.opponentScore}` : ""}</span>
                </span>
                <StatusBadge status={b.status} />
              </li>
            ))}
            {team.bookings.length === 0 && <li className="muted">No matches yet.</li>}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="h2 mb-3">Team activity</h2>
          <ul className="space-y-1.5 text-sm">
            {team.history.map((h) => (
              <li key={h.id} className="flex justify-between gap-3">
                <span>{h.detail}</span>
                <span className="shrink-0 text-xs text-slate-400">{formatDateLong(h.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
