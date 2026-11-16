import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/errors";
import { createPaymentOrder } from "@/lib/payments/service";
import { mockAllowed, razorpayConfigured } from "@/lib/payments/razorpay";
import { AppError } from "@/lib/errors";

/** Server-side order creation. Amount comes from the DB booking, never from the client. */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const { bookingId } = z.object({ bookingId: z.string() }).parse(await req.json());
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
