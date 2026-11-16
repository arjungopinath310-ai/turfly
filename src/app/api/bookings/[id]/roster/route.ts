import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError, handle } from "@/lib/errors";

const schema = z.object({
  teamName: z.string().max(60).nullable(),
  players: z
    .array(
      z.object({
        id: z.string().optional(),
        teamMemberId: z.string().nullish(),
        name: z.string().min(1).max(60),
        status: z.enum(["CONFIRMED", "PENDING", "DECLINED"]),
        isCaptain: z.boolean(),
        isSubstitute: z.boolean(),
      }),
    )
    .max(30),
});

/** Organiser updates the match roster (players, captain, substitutes, per-match team name). */
export const PUT = handle(async (req, { params }) => {
  const user = await requireUser();
  const b = await prisma.booking.findUnique({ where: { id: params.id } });
  if (!b || b.userId !== user.id) throw new AppError(404, "Booking not found");
  if (!["HELD", "CONFIRMED"].includes(b.status)) throw new AppError(400, "This booking can no longer be edited");
  const body = schema.parse(await req.json());
  if (body.players.filter((p) => p.isCaptain).length > 1) throw new AppError(400, "Only one captain per match");
  if (b.teamId && body.players.some((p) => p.teamMemberId)) {
    const ids = await prisma.teamMember.findMany({ where: { teamId: b.teamId }, select: { id: true } });
    const ok = new Set(ids.map((i) => i.id));
    if (body.players.some((p) => p.teamMemberId && !ok.has(p.teamMemberId))) throw new AppError(400, "Unknown team member");
  }
  await prisma.$transaction([
    prisma.booking.update({ where: { id: b.id }, data: { teamName: body.teamName?.trim() || null } }),
    prisma.matchPlayer.deleteMany({ where: { bookingId: b.id } }),
    prisma.matchPlayer.createMany({
      data: body.players.map((p) => ({ bookingId: b.id, teamMemberId: p.teamMemberId ?? null, name: p.name, status: p.status, isCaptain: p.isCaptain, isSubstitute: p.isSubstitute })),
    }),
  ]);
  return NextResponse.json({ ok: true });
});
