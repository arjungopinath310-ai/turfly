import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const API = "https://api.razorpay.com/v1";

export const razorpayConfigured = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

/** Mock gateway: only when Razorpay is not configured and we are not in production (unless explicitly allowed). */
export const mockAllowed = () =>
  !razorpayConfigured() && (process.env.NODE_ENV !== "production" || process.env.ALLOW_MOCK_PAYMENTS === "true");

export const providerName = () => (razorpayConfigured() ? "razorpay" : "mock");

function auth() {
  return "Basic " + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(API + path, {
    method: "POST",
    headers: { authorization: auth(), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Razorpay ${path} ${res.status}: ${json?.error?.description ?? JSON.stringify(json)}`);
  return json as T;
}

export async function createOrder(amount: number, receipt: string, notes: Record<string, string>) {
  if (!razorpayConfigured()) return { id: `order_mock_${randomBytes(8).toString("hex")}`, amount, currency: "INR" };
  return call<{ id: string; amount: number; currency: string }>("/orders", { amount, currency: "INR", receipt, notes, payment_capture: 1 });
}

export async function refundPayment(paymentId: string, amount: number, notes: Record<string, string>) {
  if (!razorpayConfigured()) return { id: `rfnd_mock_${randomBytes(8).toString("hex")}`, status: "processed" };
  return call<{ id: string; status: string }>(`/payments/${paymentId}/refund`, { amount, speed: "normal", notes });
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Checkout handler signature: HMAC_SHA256(order_id|payment_id, key_secret). Informational only. */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  return safeEqual(createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex"), signature);
}

/** Webhook signature: HMAC_SHA256(raw body, webhook secret). This is the source of truth. */
export function verifyWebhookSignature(rawBody: string, signature: string | null) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  return safeEqual(createHmac("sha256", secret).update(rawBody).digest("hex"), signature);
}
