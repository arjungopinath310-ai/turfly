import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError, handle } from "@/lib/errors";

/** Polled by checkout to learn when the webhook has confirmed the booking. */
export const GET = handle(async (_req, { params }) => {
  const user = await requireUser();
  const b = await prisma.booking.findUnique({
    where: { id: params.id },
    select: { id: true, code: true, status: true, userId: true, holdExpiresAt: true, payments: { where: { purpose: { not: "SPLIT_SHARE" } }, select: { status: true, failureReason: true }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!b || b.userId !== user.id) throw new AppError(404, "Booking not found");
  return NextResponse.json({ id: b.id, code: b.code, status: b.status, holdExpiresAt: b.holdExpiresAt, payment: b.payments[0] ?? null }, { headers: { "cache-control": "no-store" } });
});
