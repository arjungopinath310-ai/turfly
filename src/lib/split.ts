/**
 * Split payments: the organiser shares one link; each friend pays an equal share online.
 *
 * Rules
 * - Only for CONFIRMED bookings before the match starts, while a balance is due at the venue.
 * - Shares are pre-created rows. A friend "claims" a share for 10 minutes while in checkout, so two
 *   people can't pay for the last share at once. Claims expire, so abandoned checkouts free the share.
 * - Like bookings, a share is only marked paid by the verified gateway webhook. If the share can no
 *   longer be paid (all taken, split cancelled, booking cancelled, balance settled), the payment is
 *   refunded in full automatically.
 * - Each paid share lowers the balance due at the venue and is credited to the turf in the ledger.
 * - If the booking is cancelled (by anyone), every paid share is refunded in full.
 */
import type { Payment, User } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { AppError } from "./errors";
import { token } from "./ids";
import { computeSplit } from "./engine/split";
import { rupees } from "./engine/pricing";
import { notifyInApp } from "./notifications/service";
import { createOrder, providerName, refundPayment } from "./payments/razorpay";

export const CLAIM_MINUTES = 10;

class RefundInstead extends Error {}

const splitUrl = (t: string) => `/split/${t}`;

async function organiserBooking(user: User, bookingId: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { split: { include: { shares: true } } } });
  if (!b || b.userId !== user.id) throw new AppError(404, "Booking not found");
  return b;
}

function assertSplittable(b: { status: string; startAt: Date; balanceCollectedAt: Date | null; balanceDue: number }) {
  if (b.status !== "CONFIRMED") throw new AppError(400, "Only confirmed bookings can be split");
  if (b.startAt.getTime() <= Date.now()) throw new AppError(400, "The match has already started");
  if (b.balanceCollectedAt) throw new AppError(400, "The balance has already been paid at the venue");
}

/** Creates the split, or replaces it while nobody has paid yet. */
export async function createSplit(user: User, bookingId: string, players: number) {
  const b = await organiserBooking(user, bookingId);
  assertSplittable(b);
  if (b.split && !b.split.cancelledAt && b.split.shares.some((s) => s.status === "PAID"))
    throw new AppError(409, "Friends have already paid, so the split can't be changed.");
  const calc = computeSplit(b, players);
  if (!calc.ok) throw new AppError(400, calc.error);

  return prisma.$transaction(async (tx) => {
    // Replacing deletes the old shares; any checkout still open on them is refunded when it completes.
    if (b.split) await tx.splitPlan.delete({ where: { id: b.split.id } });
    return tx.splitPlan.create({
      data: {
        bookingId: b.id,
        token: token(12),
        players,
        shareAmount: calc.shareAmount,
        shares: { create: Array.from({ length: calc.friends }, (_, i) => ({ seq: i + 1 })) },
      },
      include: { shares: true },
    });
  });
}

/** Stops new payments. Only while nobody has paid (paid shares are refunded only by cancelling the booking). */
export async function cancelSplit(user: User, bookingId: string) {
  const b = await organiserBooking(user, bookingId);
  if (!b.split || b.split.cancelledAt) return;
  if (b.split.shares.some((s) => s.status === "PAID")) throw new AppError(409, "Friends have already paid, so the split can't be cancelled.");
  await prisma.splitPlan.update({ where: { id: b.split.id }, data: { cancelledAt: new Date() } });
}

/** Everything the share page needs. Payer names are shown to the group; phone numbers never are. */
export async function loadSplit(t: string) {
  const plan = await prisma.splitPlan.findUnique({
    where: { token: t },
    include: {
      shares: { orderBy: { seq: "asc" }, include: { paidBy: { select: { name: true } } } },
      booking: { include: { turf: { select: { name: true, slug: true, addressLine: true, lat: true, lng: true } }, config: { select: { name: true } }, user: { select: { name: true } } } },
    },
  });
  if (!plan) throw new AppError(404, "This split link is not valid");
  return plan;
}

export function splitOpen(plan: Awaited<ReturnType<typeof loadSplit>>) {
  const b = plan.booking;
  return !plan.cancelledAt && b.status === "CONFIRMED" && b.startAt.getTime() > Date.now() && !b.balanceCollectedAt;
}

/** Claims a share for the user (or reuses their claim) and returns a gateway order for it. */
export async function startSharePayment(user: User, t: string) {
  const plan = await loadSplit(t);
  const b = plan.booking;
  if (!splitOpen(plan)) throw new AppError(410, "This split is closed for payments.");
  if (b.userId === user.id) throw new AppError(400, "You organised this booking, so your share is paid at the venue.");
  if (plan.shares.some((s) => s.paidById === user.id)) throw new AppError(409, "You have already paid your share.");

  const now = new Date();
  const until = new Date(now.getTime() + CLAIM_MINUTES * 60_000);
  let share = plan.shares.find((s) => s.status === "OPEN" && s.claimedById === user.id && s.claimExpiresAt && s.claimExpiresAt > now);
  if (share) {
    await prisma.splitShare.update({ where: { id: share.id }, data: { claimExpiresAt: until } });
  } else {
    // Atomic claim of the first free share; SKIP LOCKED lets parallel payers take different shares.
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      UPDATE "SplitShare" SET "claimedById" = ${user.id}, "claimExpiresAt" = ${until}
      WHERE id = (
        SELECT id FROM "SplitShare"
        WHERE "planId" = ${plan.id} AND status = 'OPEN' AND ("claimedById" IS NULL OR "claimExpiresAt" < ${now})
        ORDER BY seq LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING id`;
    if (!rows.length) throw new AppError(409, `All shares are paid or being paid right now. Unfinished payments free up within ${CLAIM_MINUTES} minutes.`);
    share = plan.shares.find((s) => s.id === rows[0].id);
  }
  if (!share) throw new AppError(500, "Share not found");

  const existing = await prisma.payment.findFirst({
    where: { splitShareId: share.id, userId: user.id, status: "CREATED", amount: plan.shareAmount },
    orderBy: { createdAt: "desc" },
  });
  const payment =
    existing ??
    (await (async () => {
      const order = await createOrder(plan.shareAmount, `${b.code}-S${share.seq}`, { bookingId: b.id, code: b.code, splitShare: String(share.seq) });
      return prisma.payment.create({
        data: { bookingId: b.id, userId: user.id, provider: providerName(), providerOrderId: order.id, amount: plan.shareAmount, purpose: "SPLIT_SHARE", splitShareId: share.id },
      });
    })());
  return { payment, plan, claimExpiresAt: until };
}

/** Webhook: a share payment was captured. Marks a share paid or refunds the payment. */
export async function onShareCaptured(payment: Payment) {
  const payerId = payment.userId;
  let result: { paidCount: number; friends: number; organiserId: string | null; payerName: string; token: string; code: string; bookingId: string } | null = null;
  let reason = "";
  try {
    result = await prisma.$transaction(async (tx) => {
      if (!payment.splitShareId || !payerId) throw new RefundInstead("The split was changed by the organiser");
      const share = await tx.splitShare.findUnique({ where: { id: payment.splitShareId }, include: { plan: { include: { booking: true } } } });
      if (!share) throw new RefundInstead("The split was changed by the organiser");
      const { plan } = share;
      const b = plan.booking;
      if (plan.cancelledAt) throw new RefundInstead("The organiser cancelled the split");
      if (b.status !== "CONFIRMED" || b.startAt.getTime() <= Date.now()) throw new RefundInstead("The booking is no longer open for payments");
      if (payment.amount !== plan.shareAmount) throw new RefundInstead("The share amount changed");

      const now = new Date();
      const paid = { status: "PAID", paidById: payerId, paidPaymentId: payment.id, paidAt: now, claimedById: null, claimExpiresAt: null };
      const free = { status: "OPEN", OR: [{ claimedById: null }, { claimExpiresAt: { lt: now } }] };
      // The share this order was for (if still free or still claimed by this payer), otherwise any free share.
      let targetId: string | null = null;
      const own = await tx.splitShare.updateMany({ where: { id: share.id, status: "OPEN", OR: [{ claimedById: payerId }, ...free.OR] }, data: paid });
      if (own.count === 1) targetId = share.id;
      else {
        const other = await tx.splitShare.findFirst({ where: { planId: plan.id, ...free }, orderBy: { seq: "asc" } });
        if (other && (await tx.splitShare.updateMany({ where: { id: other.id, ...free }, data: paid })).count === 1) targetId = other.id;
      }
      if (!targetId) throw new RefundInstead("All shares had already been paid");

      const upd = await tx.booking.updateMany({
        where: { id: b.id, status: "CONFIRMED", balanceCollectedAt: null, balanceDue: { gte: payment.amount } },
        data: { balanceDue: { decrement: payment.amount }, splitCollected: { increment: payment.amount } },
      });
      if (upd.count !== 1) throw new RefundInstead("The balance was already settled at the venue");
      if (targetId !== share.id) await tx.payment.update({ where: { id: payment.id }, data: { splitShareId: targetId } });
      await tx.ledgerEntry.create({ data: { turfId: b.turfId, bookingId: b.id, paymentId: payment.id, type: "SPLIT_COLLECTED", amount: payment.amount, note: "Friend's split share collected online" } });

      const payer = await tx.user.findUnique({ where: { id: payerId }, select: { name: true } });
      const payerName = payer?.name || "A friend";
      if (!(await tx.matchPlayer.findFirst({ where: { bookingId: b.id, userId: payerId } })))
        await tx.matchPlayer.create({ data: { bookingId: b.id, userId: payerId, name: payerName.slice(0, 60), status: "CONFIRMED" } });
      const paidCount = await tx.splitShare.count({ where: { planId: plan.id, status: "PAID" } });
      return { paidCount, friends: plan.players - 1, organiserId: b.userId, payerName, token: plan.token, code: b.code, bookingId: b.id };
    });
  } catch (e) {
    if (e instanceof RefundInstead) reason = e.message;
    else if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") reason = "You had already paid a share for this booking";
    else throw e;
  }

  if (result) {
    if (result.organiserId)
      await notifyInApp(prisma, result.organiserId, `${result.payerName} paid their share`, `${result.code}: ${result.paidCount} of ${result.friends} friends have paid.`, `/bookings/${result.bookingId}`);
    if (payerId) await notifyInApp(prisma, payerId, "Share paid", `You paid ${rupees(payment.amount)} for ${result.code}. See you on the pitch!`, splitUrl(result.token));
    return "paid" as const;
  }
  await refundSharePayment(payment.id, reason);
  if (payerId) {
    const plan = payment.splitShareId ? await prisma.splitShare.findUnique({ where: { id: payment.splitShareId }, select: { plan: { select: { token: true } } } }) : null;
    await notifyInApp(prisma, payerId, "Share payment refunded", `${reason}. Your ${rupees(payment.amount)} is being refunded in full.`, plan ? splitUrl(plan.plan.token) : "/bookings");
  }
  return "refunded" as const;
}

/**
 * Refunds one share payment in full. If it had been credited (share PAID), reverses the ledger,
 * marks the share REFUNDED and restores the venue balance.
 */
export async function refundSharePayment(paymentId: string, reason: string, initiatedById?: string) {
  const p = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  const amt = p.amount - p.refundedAmount;
  if (amt <= 0 || !p.providerPaymentId) return 0;
  const r = await refundPayment(p.providerPaymentId, amt, { bookingId: p.bookingId, reason });
  await prisma.$transaction(async (tx) => {
    await tx.refund.create({ data: { paymentId: p.id, amount: amt, reason, initiatedById, providerRefundId: r.id, status: r.status === "processed" ? "PROCESSED" : "PENDING" } });
    await tx.payment.update({ where: { id: p.id }, data: { refundedAmount: p.amount, status: "REFUNDED" } });
    const share = await tx.splitShare.findUnique({ where: { paidPaymentId: p.id }, include: { plan: { include: { booking: true } } } });
    if (share?.status === "PAID") {
      await tx.splitShare.update({ where: { id: share.id }, data: { status: "REFUNDED" } });
      await tx.booking.update({ where: { id: share.plan.bookingId }, data: { splitCollected: { decrement: amt }, balanceDue: { increment: amt } } });
      await tx.ledgerEntry.create({ data: { turfId: share.plan.booking.turfId, bookingId: share.plan.bookingId, paymentId: p.id, type: "REFUND", amount: -amt, note: reason } });
    }
  });
  return amt;
}

/** Booking cancelled: close the split and refund every paid share in full. */
export async function refundSplitShares(bookingId: string, reason: string, initiatedById?: string) {
  const plan = await prisma.splitPlan.findUnique({ where: { bookingId }, include: { shares: { where: { status: "PAID" } } } });
  if (!plan) return 0;
  if (!plan.cancelledAt) await prisma.splitPlan.update({ where: { id: plan.id }, data: { cancelledAt: new Date() } });
  let total = 0;
  for (const s of plan.shares) {
    if (!s.paidPaymentId) continue;
    const amt = await refundSharePayment(s.paidPaymentId, reason, initiatedById);
    total += amt;
    if (s.paidById && amt > 0)
      await notifyInApp(prisma, s.paidById, "Booking cancelled", `${reason}. Your share of ${rupees(amt)} is being refunded in full.`, splitUrl(plan.token));
  }
  return total;
}

/** Status for the share page (polled while the payer waits for the webhook). */
export async function shareStatusFor(user: User, t: string) {
  const plan = await loadSplit(t);
  const mine = plan.shares.find((s) => s.paidById === user.id);
  const lastPayment = await prisma.payment.findFirst({
    where: { userId: user.id, purpose: "SPLIT_SHARE", bookingId: plan.bookingId },
    orderBy: { createdAt: "desc" },
    select: { status: true, failureReason: true },
  });
  return {
    open: splitOpen(plan),
    paid: mine?.status === "PAID",
    refunded: mine?.status === "REFUNDED" || lastPayment?.status === "REFUNDED",
    payment: lastPayment,
    paidCount: plan.shares.filter((s) => s.status === "PAID").length,
    friends: plan.players - 1,
  };
}
