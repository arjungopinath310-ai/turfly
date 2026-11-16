import type { User } from "@prisma/client";
import { prisma } from "../db";
import { AppError } from "../errors";
import { confirmFromPayment } from "../engine/booking";
import { notifyInApp } from "../notifications/service";
import { createOrder, providerName, verifyCheckoutSignature } from "./razorpay";
import { refundBooking } from "./refunds";
import { onShareCaptured } from "../split";

/**
 * Creates (or reuses) the gateway order for a held booking.
 * Reuse prevents duplicate orders when the user double-clicks or reloads checkout.
 */
export async function createPaymentOrder(user: User, bookingId: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b || b.userId !== user.id) throw new AppError(404, "Booking not found");
  if (b.status !== "HELD" || !b.holdExpiresAt || b.holdExpiresAt.getTime() < Date.now())
    throw new AppError(410, "Your hold on this slot has expired. Please select the slot again.", "HOLD_EXPIRED");
  if (b.onlineAmount <= 0) throw new AppError(400, "Nothing to pay");

  const existing = await prisma.payment.findFirst({ where: { bookingId, status: "CREATED", amount: b.onlineAmount, purpose: { not: "SPLIT_SHARE" } }, orderBy: { createdAt: "desc" } });
  if (existing) return { payment: existing, booking: b };

  const order = await createOrder(b.onlineAmount, b.code, { bookingId: b.id, code: b.code });
  const payment = await prisma.payment.create({
    data: {
      bookingId: b.id,
      userId: user.id,
      provider: providerName(),
      providerOrderId: order.id,
      amount: b.onlineAmount,
      purpose: b.payFullOnline ? "FULL" : "ADVANCE",
    },
  });
  return { payment, booking: b };
}

/** Browser callback. Records the signature check for diagnostics but NEVER confirms the booking. */
export async function recordClientCallback(orderId: string, paymentId: string, signature: string) {
  const ok = verifyCheckoutSignature(orderId, paymentId, signature);
  if (ok) await prisma.payment.updateMany({ where: { providerOrderId: orderId, clientVerifiedAt: null }, data: { clientVerifiedAt: new Date() } });
  return ok;
}

interface RzpPaymentEntity {
  id: string;
  order_id: string;
  amount: number;
  status: string;
  method?: string;
  error_description?: string;
}

/** Applies a verified gateway event. Idempotent: duplicate events and duplicate captures are no-ops. */
export async function applyGatewayEvent(eventId: string, type: string, payload: unknown, signatureValid: boolean) {
  const dup = await prisma.webhookEvent.findUnique({ where: { eventId } });
  if (dup?.processedAt) return { status: "duplicate" };
  const ev = dup ?? (await prisma.webhookEvent.create({ data: { provider: providerName(), eventId, type, payload: payload as object, signatureValid } }));
  if (!signatureValid) return { status: "rejected" };

  try {
    const entity = (payload as { payment?: { entity?: RzpPaymentEntity } })?.payment?.entity;
    if ((type === "payment.captured" || type === "order.paid") && entity) await onCaptured(entity);
    else if (type === "payment.failed" && entity) await onFailed(entity);
    else if (type.startsWith("refund.")) await onRefund(payload);
    await prisma.webhookEvent.update({ where: { id: ev.id }, data: { processedAt: new Date() } });
    return { status: "ok" };
  } catch (e) {
    await prisma.webhookEvent.update({ where: { id: ev.id }, data: { error: String((e as Error).message).slice(0, 1000) } });
    throw e; // non-2xx → gateway retries
  }
}

async function onCaptured(p: RzpPaymentEntity) {
  const payment = await prisma.payment.findUnique({ where: { providerOrderId: p.order_id } });
  if (!payment) throw new Error(`Unknown order ${p.order_id}`);
  if (p.amount !== payment.amount) throw new Error(`Amount mismatch on ${p.order_id}: ${p.amount} vs ${payment.amount}`);

  const { count } = await prisma.payment.updateMany({
    where: { id: payment.id, status: { in: ["CREATED", "FAILED"] } },
    data: { status: "CAPTURED", providerPaymentId: p.id, method: p.method, capturedAt: new Date(), failureReason: null },
  });
  if (count === 0) return; // already captured (duplicate event)
  if (payment.purpose === "SPLIT_SHARE") {
    await onShareCaptured(payment);
    return;
  }

  // Duplicate payment on the same booking (e.g. paid in two tabs): the earliest capture wins,
  // every later one refunds itself. Deterministic ordering means only one side ever refunds.
  const captured = await prisma.payment.findMany({
    where: { bookingId: payment.bookingId, capturedAt: { not: null }, purpose: { not: "SPLIT_SHARE" } },
    orderBy: [{ capturedAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  if (captured[0]?.id !== payment.id) {
    await refundBooking(payment.bookingId, payment.amount, "Duplicate payment auto-refund", undefined, payment.id);
    return;
  }

  const outcome = await confirmFromPayment(payment.bookingId);
  if (outcome === "lost") {
    const refunded = await refundBooking(payment.bookingId, payment.amount, "Slot no longer available after hold expiry");
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: payment.bookingId } });
    if (b.userId)
      await notifyInApp(prisma, b.userId, "Payment refunded", `Your hold on ${b.code} expired and the slot was taken. ₹${refunded / 100} is being refunded.`, `/bookings/${b.id}`);
  }
}

async function onFailed(p: RzpPaymentEntity) {
  // Booking stays HELD until expiry so the customer can retry; the slot is released automatically when the hold expires.
  await prisma.payment.updateMany({
    where: { providerOrderId: p.order_id, status: "CREATED" },
    data: { status: "FAILED", providerPaymentId: p.id, failureReason: p.error_description ?? "Payment failed" },
  });
}

async function onRefund(payload: unknown) {
  const r = (payload as { refund?: { entity?: { id: string; status: string } } })?.refund?.entity;
  if (!r) return;
  await prisma.refund.updateMany({
    where: { providerRefundId: r.id },
    data: { status: r.status === "processed" ? "PROCESSED" : r.status === "failed" ? "FAILED" : "PENDING" },
  });
}
