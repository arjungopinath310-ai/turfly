import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError, handle } from "@/lib/errors";

const score = z.number().int().min(1).max(5);

/** Only the organiser of a completed (or past confirmed) booking may review, once. */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = z
    .object({ bookingId: z.string(), turfQuality: score, cleanliness: score, lighting: score, parking: score, overall: score, comment: z.string().max(1000).optional() })
    .parse(await req.json());
  const b = await prisma.booking.findUnique({ where: { id: body.bookingId }, include: { review: true } });
  if (!b || b.userId !== user.id) throw new AppError(404, "Booking not found");
  const played = b.status === "COMPLETED" || (b.status === "CONFIRMED" && b.endAt < new Date());
  if (!played) throw new AppError(400, "You can review after your match");
  if (b.review) throw new AppError(400, "You already reviewed this booking");
  await prisma.$transaction(async (tx) => {
    await tx.review.create({ data: { ...body, turfId: b.turfId, userId: user.id } });
    const agg = await tx.review.aggregate({ where: { turfId: b.turfId }, _avg: { overall: true }, _count: true });
    await tx.turf.update({ where: { id: b.turfId }, data: { ratingAvg: agg._avg.overall ?? 0, ratingCount: agg._count } });
  });
  return NextResponse.json({ ok: true }, { status: 201 });
});
