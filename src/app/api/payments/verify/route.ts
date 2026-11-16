import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/errors";
import { recordClientCallback } from "@/lib/payments/service";

/**
 * Browser handler callback from Razorpay Checkout.
 * We verify and record the signature, but DO NOT confirm the booking here —
 * confirmation happens only in the webhook. The client then polls booking status.
 */
export const POST = handle(async (req) => {
  await requireUser();
  const b = z
    .object({ razorpay_order_id: z.string(), razorpay_payment_id: z.string(), razorpay_signature: z.string() })
    .parse(await req.json());
  const valid = await recordClientCallback(b.razorpay_order_id, b.razorpay_payment_id, b.razorpay_signature);
  return NextResponse.json({ received: true, signatureValid: valid, next: "poll_booking_status" });
});
