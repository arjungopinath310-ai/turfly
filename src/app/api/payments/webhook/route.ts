import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { applyGatewayEvent } from "@/lib/payments/service";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";

/**
 * Razorpay webhook — the ONLY place a booking becomes CONFIRMED.
 * Configure in Razorpay Dashboard → Webhooks with events:
 *   payment.captured, payment.failed, order.paid, refund.processed, refund.failed
 */
export async function POST(req: Request) {
  const raw = await req.text(); // raw body is required for HMAC verification
  const signature = req.headers.get("x-razorpay-signature");
  const valid = verifyWebhookSignature(raw, signature);
  let body: { event?: string; payload?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const eventId = req.headers.get("x-razorpay-event-id") ?? "sha_" + createHash("sha256").update(raw).digest("hex");
  try {
    const r = await applyGatewayEvent(eventId, body.event ?? "unknown", body.payload ?? {}, valid);
    if (r.status === "rejected") return NextResponse.json({ error: "invalid signature" }, { status: 400 });
    return NextResponse.json(r);
  } catch (e) {
    console.error("[webhook]", e);
    return NextResponse.json({ error: "processing failed" }, { status: 500 }); // Razorpay will retry
  }
}
