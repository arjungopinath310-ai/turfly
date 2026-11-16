import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cancelBooking } from "@/lib/engine/booking";
import { customerRefund, parsePolicy } from "@/lib/engine/policy";
import { AppError, handle } from "@/lib/errors";

async function load(userId: string, id: string) {
  const b = await prisma.booking.findUnique({ where: { id }, include: { payments: true } });
  if (!b || b.userId !== userId) throw new AppError(404, "Booking not found");
  return b;
}

/** Refund preview so the customer sees the exact outcome before confirming. */
export const GET = handle(async (_req, { params }) => {
  const user = await requireUser();
  const b = await load(user.id, params.id);
  const paid = b.payments.filter((p) => p.status === "CAPTURED").reduce((a, p) => a + p.amount - p.refundedAmount, 0);
  return NextResponse.json(customerRefund(parsePolicy(b.policySnapshot), paid, b.startAt));
});

export const POST = handle(async (req, { params }) => {
  const user = await requireUser();
  await load(user.id, params.id);
  const { reason } = z.object({ reason: z.string().max(300).default("Cancelled by customer") }).parse(await req.json().catch(() => ({})));
  return NextResponse.json(await cancelBooking(user, params.id, reason, "customer"));
});
