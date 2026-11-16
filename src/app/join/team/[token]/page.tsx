import { notFound } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { JoinTeamButton } from "@/components/JoinTeamButton";

export default async function JoinTeam({ params }: { params: { token: string } }) {
  const team = await prisma.team.findUnique({
    where: { inviteToken: params.token },
    include: { owner: { select: { name: true } }, _count: { select: { members: { where: { status: { not: "REMOVED" } } } } } },
  });
  if (!team || team.archived) notFound();
  const user = await currentUser();
  return (
    <div className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-4">
      <div className="card w-full space-y-4 p-7 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-brand-50 text-3xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {team.logoUrl ? <img src={team.logoUrl} alt="" className="h-full w-full object-cover" /> : "🛡️"}
        </div>
        <div>
          <div className="text-sm text-slate-500">{team.owner.name ?? "A player"} invited you to join</div>
          <h1 className="h1">{team.name}</h1>
          <div className="muted">{team.playersPerSide}-a-side · {team._count.members} players</div>
        </div>
        {user ? <JoinTeamButton token={params.token} /> : <Link href={`/login?next=/join/team/${params.token}`} className="btn-primary w-full">Sign in to join</Link>}
        <p className="text-xs text-slate-400">Your phone number stays private unless you choose to share it with teammates in your profile.</p>
      </div>
    </div>
  );
}
