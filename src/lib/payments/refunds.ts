import { prisma } from "../db";
import { refundPayment } from "./razorpay";

/**
 * Refunds up to `amount` across the booking's captured payments.
 * Records Refund rows and ledger entries. Safe to call with amount 0 (no-op).
 */
export async function refundBooking(bookingId: string, amount: number, reason: string, initiatedById?: string, onlyPaymentId?: string) {
  if (amount <= 0) return 0;
  const payments = await prisma.payment.findMany({
    where: { bookingId, ...(onlyPaymentId ? { id: onlyPaymentId } : {}), status: { in: ["CAPTURED", "PARTIALLY_REFUNDED", "REFUND_PENDING"] } },
    orderBy: { createdAt: "asc" },
  });
  let remaining = amount;
  let refunded = 0;
  for (const p of payments) {
    const refundable = p.amount - p.refundedAmount;
    const amt = Math.min(refundable, remaining);
    if (amt <= 0 || !p.providerPaymentId) continue;
    const r = await refundPayment(p.providerPaymentId, amt, { bookingId, reason });
    await prisma.$transaction(async (tx) => {
      await tx.refund.create({
        data: { paymentId: p.id, amount: amt, reason, initiatedById, providerRefundId: r.id, status: r.status === "processed" ? "PROCESSED" : "PENDING" },
      });
      const newRefunded = p.refundedAmount + amt;
      await tx.payment.update({
        where: { id: p.id },
        data: { refundedAmount: newRefunded, status: newRefunded >= p.amount ? "REFUNDED" : "PARTIALLY_REFUNDED" },
      });
      // Only reverse money that was credited to the owner (not duplicate / never-confirmed payments).
      const credited = !onlyPaymentId && (await tx.ledgerEntry.findFirst({ where: { bookingId, type: "ADVANCE_COLLECTED" } }));
      if (credited) await tx.ledgerEntry.create({ data: { turfId: credited.turfId, bookingId, paymentId: p.id, type: "REFUND", amount: -amt, note: reason } });
    });
    remaining -= amt;
    refunded += amt;
    if (remaining <= 0) break;
  }
  return refunded;
}
