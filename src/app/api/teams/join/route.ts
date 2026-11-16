import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError, handle } from "@/lib/errors";

/** Accept a team invite link. Links to an existing invited slot (matching phone) or creates a new member. */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const { token, memberId } = z.object({ token: z.string(), memberId: z.string().optional() }).parse(await req.json());
  const team = await prisma.team.findUnique({ where: { inviteToken: token } });
  if (!team || team.archived) throw new AppError(404, "This invite link is invalid or has been reset");
  const already = await prisma.teamMember.findFirst({ where: { teamId: team.id, userId: user.id, status: { not: "REMOVED" } } });
  if (already) return NextResponse.json({ teamId: team.id, already: true });

  const slot =
    (memberId && (await prisma.teamMember.findFirst({ where: { id: memberId, teamId: team.id, userId: null, status: "INVITED" } }))) ||
    (user.phone && (await prisma.teamMember.findFirst({ where: { teamId: team.id, phone: user.phone, userId: null, status: "INVITED" } })));
  await prisma.$transaction(async (tx) => {
    if (slot) await tx.teamMember.update({ where: { id: slot.id }, data: { userId: user.id, status: "ACTIVE", phone: user.phone ?? slot.phone } });
    else
      await tx.teamMember.create({
        data: { teamId: team.id, userId: user.id, name: user.name ?? "Player", phone: user.phone, email: user.email, position: user.preferredPosition, status: "ACTIVE" },
      });
    await tx.teamEvent.create({ data: { teamId: team.id, type: "MEMBER_JOINED", detail: `${user.name ?? "A player"} joined via invite` } });
    await tx.notification.create({ data: { userId: team.ownerId, title: `${user.name ?? "A player"} joined ${team.name}`, body: "Accepted your team invite", link: `/teams/${team.id}` } });
  });
  return NextResponse.json({ teamId: team.id });
});
