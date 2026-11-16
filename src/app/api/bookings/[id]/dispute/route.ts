import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError, handle } from "@/lib/errors";

export const POST = handle(async (req, { params }) => {
  const user = await requireUser();
  const b = await prisma.booking.findUnique({ where: { id: params.id } });
  if (!b || b.userId !== user.id) throw new AppError(404, "Booking not found");
  const { reason } = z.object({ reason: z.string().min(10, "Please describe the issue").max(1000) }).parse(await req.json());
  const open = await prisma.dispute.findFirst({ where: { bookingId: b.id, status: "OPEN" } });
  if (open) throw new AppError(400, "A dispute is already open for this booking");
  await prisma.dispute.create({ data: { bookingId: b.id, raisedById: user.id, reason } });
  return NextResponse.json({ ok: true }, { status: 201 });
});
