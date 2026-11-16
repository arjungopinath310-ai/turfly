import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError, handle } from "@/lib/errors";
import { mockAllowed } from "@/lib/payments/razorpay";
import { applyGatewayEvent } from "@/lib/payments/service";

/**
 * DEVELOPMENT ONLY. Simulates the gateway sending a webhook so the full confirmation path
 * (idempotency, hold expiry, re-acquire, auto-refund) can be exercised without Razorpay keys.
 * Disabled whenever Razorpay is configured, and in production unless ALLOW_MOCK_PAYMENTS=true.
 */
export const POST = handle(async (req) => {
  if (!mockAllowed()) throw new AppError(404, "Not found");
  const user = await requireUser();
  const { orderId, outcome, method } = z
    .object({ orderId: z.string().startsWith("order_mock_"), outcome: z.enum(["success", "failure"]), method: z.enum(["upi", "card", "netbanking", "wallet"]).default("upi") })
    .parse(await req.json());
  const payment = await prisma.payment.findUnique({ where: { providerOrderId: orderId } });
  if (!payment || payment.userId !== user.id) throw new AppError(404, "Order not found");
  const entity = {
    id: `pay_mock_${randomBytes(7).toString("hex")}`,
    order_id: orderId,
    amount: payment.amount,
    status: outcome === "success" ? "captured" : "failed",
    method,
    error_description: outcome === "failure" ? "Payment declined (simulated)" : undefined,
  };
  const r = await applyGatewayEvent(`evt_mock_${randomBytes(8).toString("hex")}`, outcome === "success" ? "payment.captured" : "payment.failed", { payment: { entity } }, true);
  return NextResponse.json(r);
});
