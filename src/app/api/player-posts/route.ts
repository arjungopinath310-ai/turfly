import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError, handle } from "@/lib/errors";

/** "Need 3 more players for a 5-a-side match at Manjeri, Friday 7 PM" */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = z
    .object({
      bookingId: z.string(),
      playersNeeded: z.coerce.number().int().min(1).max(10),
      skillLevel: z.string().max(30).optional(),
      sharePerPlayer: z.coerce.number().int().min(0).max(100_000).optional(), // rupees
      note: z.string().max(300).optional(),
    })
    .parse(await req.json());
  const b = await prisma.booking.findUnique({ where: { id: body.bookingId }, include: { turf: true, config: true } });
  if (!b || b.userId !== user.id || b.status !== "CONFIRMED" || b.startAt < new Date()) throw new AppError(400, "Pick one of your upcoming confirmed bookings");
  const post = await prisma.playerPost.create({
    data: {
      userId: user.id,
      cityId: b.turf.cityId,
      turfId: b.turfId,
      bookingId: b.id,
      playersNeeded: body.playersNeeded,
      playersPerSide: b.config.playersPerSide,
      startAt: b.startAt,
      skillLevel: body.skillLevel,
      sharePerPlayer: body.sharePerPlayer != null ? body.sharePerPlayer * 100 : null,
      note: body.note,
    },
  });
  return NextResponse.json({ id: post.id }, { status: 201 });
});
