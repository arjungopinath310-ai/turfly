import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError, handle } from "@/lib/errors";
import { token } from "@/lib/ids";
import { requireTeamOwner } from "@/lib/teams";

export const PATCH = handle(async (req, { params }) => {
  const user = await requireUser();
  const team = await requireTeamOwner(user.id, params.id);
  const body = z
    .object({
      name: z.string().trim().min(2).max(60).optional(),
      playersPerSide: z.coerce.number().int().min(3).max(11).optional(),
      logoUrl: z.string().max(200_000).nullable().optional(),
      regenerateInvite: z.boolean().optional(),
      archived: z.boolean().optional(),
    })
    .parse(await req.json());
  if (body.logoUrl && !/^(data:image\/(png|jpeg|webp);base64,|https:\/\/)/.test(body.logoUrl)) throw new AppError(400, "Invalid logo");
  await prisma.$transaction(async (tx) => {
    await tx.team.update({
      where: { id: team.id },
      data: {
        name: body.name,
        playersPerSide: body.playersPerSide,
        logoUrl: body.logoUrl,
        archived: body.archived,
        inviteToken: body.regenerateInvite ? token(12) : undefined,
      },
    });
    if (body.name && body.name !== team.name)
      await tx.teamEvent.create({ data: { teamId: team.id, type: "RENAMED", detail: `Renamed from "${team.name}" to "${body.name}"` } });
  });
  return NextResponse.json({ ok: true });
});
