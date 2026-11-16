import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError, handle } from "@/lib/errors";
import { cleanMember, memberSchema, requireTeamOwner } from "@/lib/teams";

async function load(userId: string, teamId: string, memberId: string) {
  const team = await requireTeamOwner(userId, teamId);
  const m = await prisma.teamMember.findFirst({ where: { id: memberId, teamId } });
  if (!m) throw new AppError(404, "Member not found");
  return { team, m };
}

/** Edit / replace a member, or make them captain. */
export const PATCH = handle(async (req, { params }) => {
  const user = await requireUser();
  const { team, m } = await load(user.id, params.id, params.memberId);
  const data = cleanMember(memberSchema.partial().extend({ name: memberSchema.shape.name.optional() }).parse(await req.json()) as never);
  await prisma.$transaction(async (tx) => {
    if (data.isCaptain) {
      await tx.teamMember.updateMany({ where: { teamId: team.id }, data: { isCaptain: false } });
      await tx.teamEvent.create({ data: { teamId: team.id, type: "CAPTAIN_CHANGED", detail: `${data.name ?? m.name} is now captain` } });
    }
    await tx.teamMember.update({ where: { id: m.id }, data });
  });
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (_req, { params }) => {
  const user = await requireUser();
  const { team, m } = await load(user.id, params.id, params.memberId);
  if (m.userId === team.ownerId) throw new AppError(400, "You can't remove yourself as the team owner");
  await prisma.$transaction([
    prisma.teamMember.update({ where: { id: m.id }, data: { status: "REMOVED", isCaptain: false } }),
    prisma.teamEvent.create({ data: { teamId: team.id, type: "MEMBER_REMOVED", detail: `${m.name} removed` } }),
  ]);
  return NextResponse.json({ ok: true });
});
