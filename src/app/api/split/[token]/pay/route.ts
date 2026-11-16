import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { AppError, handle } from "@/lib/errors";
import { mockAllowed, razorpayConfigured } from "@/lib/payments/razorpay";
import { startSharePayment } from "@/lib/split";

/** Claims a share for the signed-in friend and returns the gateway order. Amount comes from the DB. */
export const POST = handle(async (_req, { params }) => {
  const user = await requireUser();
  if (!razorpayConfigured() && !mockAllowed()) throw new AppError(503, "Online payments are not configured");
  const { payment, plan, claimExpiresAt } = await startSharePayment(user, params.token);
  return NextResponse.json({
    provider: payment.provider,
    keyId: process.env.RAZORPAY_KEY_ID ?? null,
    orderId: payment.providerOrderId,
    amount: payment.amount,
    currency: payment.currency,
    bookingCode: plan.booking.code,
    claimExpiresAt,
    prefill: { contact: user.phone ?? undefined, email: user.email ?? undefined, name: user.name ?? undefined },
  });
});
