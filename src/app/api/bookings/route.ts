import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createHold } from "@/lib/engine/booking";
import { handle } from "@/lib/errors";

const schema = z.object({
  turfId: z.string(),
  configId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startMinute: z.number().int().min(0).max(1800),
  durationMinutes: z.number().int().min(30).max(240),
  teamId: z.string().nullish(),
  newTeamName: z.string().max(60).nullish(),
  teamName: z.string().max(60).nullish(),
  offerCode: z.string().max(30).optional(),
  payFullOnline: z.boolean().optional(),
  /** "Short of players": list the game so players without a team can ask to join */
  openSpots: z
    .object({
      playersNeeded: z.number().int().min(1).max(21),
      note: z.string().max(300).nullish(),
      skillLevel: z.string().max(30).nullish(),
    })
    .nullish(),
});

/** Creates a temporary HOLD on the slot. Confirmation happens only via the payment webhook. */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = schema.parse(await req.json());
  let teamId = body.teamId ?? null;
  if (!teamId && body.newTeamName?.trim()) {
    const { createTeam } = await import("@/lib/teams");
    const config = await prisma.pitchConfig.findUniqueOrThrow({ where: { id: body.configId } });
    teamId = (await createTeam(user, { name: body.newTeamName.trim(), playersPerSide: config.playersPerSide })).id;
  }
  const booking = await createHold(user, { ...body, teamId });
  return NextResponse.json({ id: booking.id, code: booking.code, holdExpiresAt: booking.holdExpiresAt }, { status: 201 });
});

export const GET = handle(async () => {
  const user = await requireUser();
  const bookings = await prisma.booking.findMany({
    where: { userId: user.id, status: { in: ["CONFIRMED", "COMPLETED", "CANCELLED", "HELD"] } },
    include: { turf: { select: { name: true, slug: true } }, config: { select: { name: true } } },
    orderBy: { startAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ bookings });
});
