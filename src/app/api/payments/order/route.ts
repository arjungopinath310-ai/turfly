import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/errors";
import { createPaymentOrder } from "@/lib/payments/service";
import { mockAllowed, razorpayConfigured } from "@/lib/payments/razorpay";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { confirmFromPayment } from "@/lib/engine/booking";

/** Server-side order creation. Amount comes from the DB booking, never from the client. */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const { bookingId } = z.object({ bookingId: z.string() }).parse(await req.json());
  // Fully paid with Turf coins: nothing to charge, confirm straight away
  const held = await prisma.booking.findUnique({ where: { id: bookingId }, select: { userId: true, status: true, onlineAmount: true, coinsUsed: true, holdExpiresAt: true } });
  if (held && held.userId === user.id && held.status === "HELD" && held.onlineAmount === 0 && held.coinsUsed > 0) {
    if (!held.holdExpiresAt || held.holdExpiresAt.getTime() < Date.now()) throw new AppError(410, "Your hold on this slot has expired. Please select the slot again.", "HOLD_EXPIRED");
    const outcome = await confirmFromPayment(bookingId);
    if (outcome === "lost") throw new AppError(409, "That slot was just taken. Your coins have been returned.");
    return NextResponse.json({ paidWithCoins: true });
  }
  if (!razorpayConfigured() && !mockAllowed()) throw new AppError(503, "Online payments are not configured");
  const { payment, booking } = await createPaymentOrder(user, bookingId);
  return NextResponse.json({
    provider: payment.provider,
    keyId: process.env.RAZORPAY_KEY_ID ?? null,
    orderId: payment.providerOrderId,
    amount: payment.amount,
    currency: payment.currency,
    bookingCode: booking.code,
    prefill: { contact: user.phone ?? undefined, email: user.email ?? undefined, name: user.name ?? undefined },
  });
});
