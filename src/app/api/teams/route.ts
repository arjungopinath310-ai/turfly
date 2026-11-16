import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handle } from "@/lib/errors";
import { createTeam } from "@/lib/teams";

export const GET = handle(async () => {
  const user = await requireUser();
  const teams = await prisma.team.findMany({
    where: { ownerId: user.id, archived: false },
    include: { _count: { select: { members: { where: { status: { not: "REMOVED" } } } } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ teams: teams.map((t) => ({ id: t.id, name: t.name, playersPerSide: t.playersPerSide, logoUrl: t.logoUrl, members: t._count.members })) });
});

export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = z
    .object({ name: z.string().trim().min(2).max(60), playersPerSide: z.coerce.number().int().min(3).max(11), logoUrl: z.string().max(200_000).nullish() })
    .parse(await req.json());
  const team = await createTeam(user, body);
  return NextResponse.json({ id: team.id }, { status: 201 });
});
