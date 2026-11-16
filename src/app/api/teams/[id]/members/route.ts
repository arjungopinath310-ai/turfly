import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError, handle } from "@/lib/errors";
import { cleanMember, memberSchema, requireTeamOwner } from "@/lib/teams";

export const POST = handle(async (req, { params }) => {
  const user = await requireUser();
  const team = await requireTeamOwner(user.id, params.id);
  const data = cleanMember(memberSchema.parse(await req.json()));
  const count = await prisma.teamMember.count({ where: { teamId: team.id, status: { not: "REMOVED" } } });
  if (count >= 25) throw new AppError(400, "A team can have at most 25 members");
  const m = await prisma.$transaction(async (tx) => {
    if (data.isCaptain) await tx.teamMember.updateMany({ where: { teamId: team.id }, data: { isCaptain: false } });
    const m = await tx.teamMember.create({ data: { ...data, isCaptain: Boolean(data.isCaptain), teamId: team.id, status: "INVITED" } });
    await tx.teamEvent.create({ data: { teamId: team.id, type: "MEMBER_ADDED", detail: `${m.name} added` } });
    return m;
  });
  return NextResponse.json({ id: m.id }, { status: 201 });
});
