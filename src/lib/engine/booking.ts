import { randomUUID } from "node:crypto";
import type { Booking, BookingSource, PitchConfig, PricingRule, Turf, User } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { AppError, SlotConflictError, isExclusionViolation } from "../errors";
import { bookingCode } from "../ids";
import { getSettings, turfPolicy } from "../settings";
import { addDays, formatIst, istToUtc, todayIst, weekdayOf } from "../time";
import type { OccupancyRow } from "./allocation";
import { customerRefund, parsePolicy } from "./policy";
import { quote, type OfferLite } from "./pricing";
import { generateSlots, priceFor, type Slot } from "./slots";
import { cancelBookingJobs, notifyInApp, scheduleBookingJobs } from "../notifications/service";
import { refundBooking } from "../payments/refunds";
import { refundSplitShares } from "../split";
import { closeGamesForBooking, listGame, moveGamesForBooking, openGamesForBooking, type ListingInput } from "../games";

// ───────────── Hold expiry ─────────────

/**
 * Atomically expire overdue holds and release their occupancy (single statement → no race window).
 * Prisma stores DateTime as UTC `timestamp` (no zone), so compare against now() in UTC explicitly;
 * a bare now() would be shifted by the server's TimeZone setting (e.g. Asia/Calcutta).
 */
export async function releaseExpiredHolds(db: Tx = prisma) {
  return db.$executeRaw`
    WITH expired AS (
      UPDATE "Booking" SET status = 'EXPIRED', "updatedAt" = (now() AT TIME ZONE 'UTC')
      WHERE status = 'HELD' AND "holdExpiresAt" < (now() AT TIME ZONE 'UTC')
      RETURNING id
    )
    UPDATE "Occupancy" SET released = true WHERE "bookingId" IN (SELECT id FROM expired)`;
}

async function insertOccupancy(db: Tx, unitIds: string[], startAt: Date, endAt: Date, ref: { bookingId?: string; blockId?: string }) {
  for (const unitId of unitIds) {
    await db.$executeRaw`
      INSERT INTO "Occupancy" (id, "unitId", "bookingId", "blockId", "startAt", "endAt", released, "createdAt")
      VALUES (${randomUUID()}, ${unitId}, ${ref.bookingId ?? null}, ${ref.blockId ?? null},
              (${startAt.toISOString()}::timestamptz AT TIME ZONE 'UTC'), (${endAt.toISOString()}::timestamptz AT TIME ZONE 'UTC'),
              false, (now() AT TIME ZONE 'UTC'))`;
  }
}

// ───────────── Availability ─────────────

type ConfigWithUnits = PitchConfig & { units: { unitId: string }[]; pricingRules: PricingRule[] };

export async function loadOccupancy(turfId: string, from: Date, to: Date): Promise<OccupancyRow[]> {
  const rows = await prisma.occupancy.findMany({
    where: { released: false, unit: { turfId }, startAt: { lt: to }, endAt: { gt: from } },
    include: { booking: { select: { status: true, holdExpiresAt: true } } },
  });
  const now = Date.now();
  return rows.flatMap((r): OccupancyRow[] => {
    let kind: OccupancyRow["kind"];
    if (r.blockId) kind = "blocked";
    else if (r.booking?.status === "HELD") {
      if (!r.booking.holdExpiresAt || r.booking.holdExpiresAt.getTime() < now) return []; // expired, pending sweep
      kind = "held";
    } else kind = "booked";
    return [{ unitId: r.unitId, start: r.startAt.getTime(), end: r.endAt.getTime(), kind }];
  });
}

export async function getAvailability(turfId: string, date: string, duration: number, opts: { forOwner?: boolean } = {}) {
  const turf = await prisma.turf.findUnique({
    where: { id: turfId },
    include: { hours: true, configs: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { units: true, pricingRules: true } } },
  });
  if (!turf) throw new AppError(404, "Turf not found");
  const hours = turf.hours.find((h) => h.weekday === weekdayOf(date)) ?? null;
  const dayStart = istToUtc(date, 0);
  const dayEnd = istToUtc(date, 1800);
  const occupancy = await loadOccupancy(turfId, dayStart, dayEnd);
  const now = new Date();
  return {
    turf,
    hours,
    configs: turf.configs.map((c) => ({
      id: c.id,
      name: c.name,
      playersPerSide: c.playersPerSide,
      basePricePerHour: c.basePricePerHour,
      unitIds: c.units.map((u) => u.unitId),
      slots: generateSlots({
        date,
        hours,
        step: turf.slotStepMinutes,
        duration,
        unitIds: c.units.map((u) => u.unitId),
        occupancy,
        basePricePerHour: c.basePricePerHour,
        rules: c.pricingRules,
        now,
        minNoticeMinutes: opts.forOwner ? -60 : turf.minNoticeMinutes,
      }),
    })),
  };
}

// ───────────── Validation & quoting ─────────────

interface SlotRequest {
  turfId: string;
  configId: string;
  date: string;
  startMinute: number;
  durationMinutes: number;
}

async function validateSlot(req: SlotRequest, asOwner: boolean) {
  const turf = await prisma.turf.findUnique({ where: { id: req.turfId }, include: { hours: true } });
  if (!turf) throw new AppError(404, "Turf not found");
  if (!asOwner && (turf.status !== "APPROVED" || turf.availabilityMode !== "LIVE"))
    throw new AppError(400, "This turf does not accept online bookings yet. Please call the turf directly.");
  const config = (await prisma.pitchConfig.findFirst({
    where: { id: req.configId, turfId: turf.id, isActive: true },
    include: { units: true, pricingRules: true },
  })) as ConfigWithUnits | null;
  if (!config || config.units.length === 0) throw new AppError(400, "Pitch configuration not available");
  if (!turf.allowedDurations.includes(req.durationMinutes)) throw new AppError(400, "Unsupported duration");
  if (req.startMinute % turf.slotStepMinutes !== 0) throw new AppError(400, "Invalid start time");
  const hours = turf.hours.find((h) => h.weekday === weekdayOf(req.date));
  if (!hours || hours.isClosed || req.startMinute < hours.openMinute || req.startMinute + req.durationMinutes > hours.closeMinute)
    throw new AppError(400, "Outside operating hours");
  const startAt = istToUtc(req.date, req.startMinute);
  const endAt = istToUtc(req.date, req.startMinute + req.durationMinutes);
  const now = Date.now();
  if (!asOwner) {
    if (startAt.getTime() < now + turf.minNoticeMinutes * 60_000) throw new AppError(400, "This slot is too soon to book online");
    if (req.date > addDays(todayIst(), turf.maxAdvanceDays)) throw new AppError(400, `Bookings open ${turf.maxAdvanceDays} days in advance`);
  } else if (endAt.getTime() < now) throw new AppError(400, "That slot is already over");
  const { price } = priceFor(req.date, req.startMinute, req.durationMinutes, config.basePricePerHour, config.pricingRules);
  return { turf, config, startAt, endAt, price, unitIds: config.units.map((u) => u.unitId) };
}

export async function resolveOffer(code: string | undefined, turfId: string, userId: string | null) {
  if (!code) return null;
  const o = await prisma.offer.findUnique({ where: { code: code.trim().toUpperCase() } });
  const now = new Date();
  const bad = () => new AppError(400, "This offer code is not valid for this booking");
  if (!o || !o.isActive || (o.turfId && o.turfId !== turfId)) throw bad();
  if ((o.validFrom && o.validFrom > now) || (o.validTo && o.validTo < now)) throw bad();
  if (o.usageLimit != null && o.usedCount >= o.usageLimit) throw bad();
  if (userId && (o.kind === "FIRST_BOOKING" || o.kind === "REPEAT")) {
    const done = await prisma.booking.count({ where: { userId, status: { in: ["CONFIRMED", "COMPLETED"] } } });
    if (o.kind === "FIRST_BOOKING" && done > 0) throw new AppError(400, "This offer is for your first booking only");
    if (o.kind === "REPEAT" && done < (o.minBookings ?? 1)) throw new AppError(400, `This offer unlocks after ${o.minBookings} bookings`);
  }
  return o;
}

export async function quoteSlot(req: SlotRequest & { offerCode?: string; payFullOnline?: boolean; userId?: string | null }) {
  const v = await validateSlot(req, false);
  const s = await getSettings();
  const offer = await resolveOffer(req.offerCode, req.turfId, req.userId ?? null);
  const policy = turfPolicy(v.turf, s);
  const q = quote({
    totalPrice: v.price,
    advancePaise: s.advanceAmountPaise,
    platformFeePaise: s.platformFeePaise,
    offer: offer as OfferLite | null,
    payFullOnline: Boolean(req.payFullOnline && v.turf.fullOnlinePaymentEnabled),
  });
  return { ...v, quote: q, offer, policy, settings: s };
}

// ───────────── Hold (customer checkout) ─────────────

export async function createHold(
  user: User,
  req: SlotRequest & { teamId?: string | null; teamName?: string | null; offerCode?: string; payFullOnline?: boolean; openSpots?: ListingInput | null },
): Promise<Booking> {
  const q = await quoteSlot({ ...req, userId: user.id });
  if (req.teamId) {
    const team = await prisma.team.findFirst({ where: { id: req.teamId, ownerId: user.id } });
    if (!team) throw new AppError(400, "Team not found");
  }
  const holdExpiresAt = new Date(Date.now() + q.settings.holdMinutes * 60_000);
  try {
    return await prisma.$transaction(async (tx) => {
      await releaseExpiredHolds(tx);
      const active = await tx.booking.count({ where: { userId: user.id, status: "HELD", holdExpiresAt: { gt: new Date() } } });
      if (active >= q.settings.maxActiveHoldsPerUser) throw new AppError(429, "You already have slots on hold. Complete or cancel them first.");
      const booking = await tx.booking.create({
        data: {
          code: bookingCode(),
          turfId: q.turf.id,
          configId: q.config.id,
          userId: user.id,
          source: "ONLINE",
          status: "HELD",
          startAt: q.startAt,
          endAt: q.endAt,
          durationMinutes: req.durationMinutes,
          ...q.quote,
          payFullOnline: q.quote.balanceDue === 0 && Boolean(req.payFullOnline),
          offerId: q.offer?.id,
          policySnapshot: q.policy,
          holdExpiresAt,
          teamId: req.teamId ?? null,
          teamName: req.teamName?.trim() || null,
        },
      });
      await insertOccupancy(tx, q.unitIds, q.startAt, q.endAt, { bookingId: booking.id });
      if (req.teamId) await seedRosterFromTeam(tx, booking.id, req.teamId);
      // "Short of players": listed now, visible to others once the payment confirms the booking
      if (req.openSpots) await listGame(tx, { ...booking, turf: q.turf, config: q.config }, req.openSpots, "DRAFT");
      return booking;
    });
  } catch (e) {
    if (isExclusionViolation(e)) throw new SlotConflictError();
    throw e;
  }
}

async function seedRosterFromTeam(tx: Tx, bookingId: string, teamId: string) {
  const members = await tx.teamMember.findMany({ where: { teamId, status: { not: "REMOVED" } } });
  if (members.length)
    await tx.matchPlayer.createMany({
      data: members.map((m) => ({ bookingId, teamMemberId: m.id, userId: m.userId, name: m.name, isCaptain: m.isCaptain, status: "PENDING" as const })),
    });
}

// ───────────── Confirmation (called only from verified webhook) ─────────────

/**
 * Confirms a HELD booking. Returns "confirmed" | "already" | "lost".
 * "lost" means the hold expired AND someone else took the slot → caller must refund.
 */
export async function confirmFromPayment(bookingId: string): Promise<"confirmed" | "already" | "lost"> {
  const result = await prisma.$transaction(async (tx) => {
    const { count } = await tx.booking.updateMany({
      where: { id: bookingId, status: "HELD" },
      data: { status: "CONFIRMED", confirmedAt: new Date(), holdExpiresAt: null },
    });
    if (count === 1) return "confirmed" as const;
    const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    if (b.status === "CONFIRMED" || b.status === "COMPLETED") return "already" as const;
    return "reacquire" as const;
  });
  if (result === "reacquire") {
    // Hold expired before the webhook arrived. Try to take the slot again; DB constraint arbitrates.
    try {
      await prisma.$transaction(async (tx) => {
        const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { config: { include: { units: true } } } });
        if (b.status !== "EXPIRED") throw new AppError(409, "Booking not reacquirable");
        if (b.startAt.getTime() < Date.now()) throw new SlotConflictError();
        await insertOccupancy(tx, b.config.units.map((u) => u.unitId), b.startAt, b.endAt, { bookingId });
        const { count } = await tx.booking.updateMany({ where: { id: bookingId, status: "EXPIRED" }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
        if (count !== 1) throw new SlotConflictError();
      });
    } catch (e) {
      if (isExclusionViolation(e) || e instanceof AppError) return "lost";
      throw e;
    }
  }
  await afterConfirm(bookingId);
  return result === "already" ? "already" : "confirmed";
}

async function afterConfirm(bookingId: string) {
  await prisma.$transaction(async (tx) => {
    const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { turf: true } });
    await openGamesForBooking(tx, bookingId);
    // Ledger + offer usage exactly once per booking
    const exists = await tx.ledgerEntry.findFirst({ where: { bookingId, type: "ADVANCE_COLLECTED" } });
    if (!exists) {
      const s = await getSettings();
      const pct = b.turf.commissionPercent ?? s.defaultCommissionPercent;
      const owed = b.onlineAmount - b.platformFee;
      await tx.ledgerEntry.create({ data: { turfId: b.turfId, bookingId, type: "ADVANCE_COLLECTED", amount: owed, note: "Online advance collected by platform" } });
      if (pct > 0) {
        const commission = Math.round(((b.totalPrice - b.discount) * pct) / 100);
        await tx.ledgerEntry.create({ data: { turfId: b.turfId, bookingId, type: "COMMISSION", amount: -commission, note: `${pct}% platform commission on booking value` } });
      }
      if (b.offerId) await tx.offer.update({ where: { id: b.offerId }, data: { usedCount: { increment: 1 } } });
      await scheduleBookingJobs(tx, bookingId);
      if (b.turf.ownerId) await notifyInApp(tx, b.turf.ownerId, `New booking ${b.code}`, `${b.turf.name}`, `/owner/bookings?focus=${b.id}`);
    }
  });
}

// ───────────── Owner: walk-in / phone bookings & blocks ─────────────

export async function createManualBooking(
  actor: User,
  req: SlotRequest & { customerName: string; customerPhone?: string; source: BookingSource; teamName?: string; amountCollected?: number; notes?: string },
) {
  const v = await validateSlot(req, true);
  const s = await getSettings();
  try {
    return await prisma.$transaction(async (tx) => {
      await releaseExpiredHolds(tx);
      const b = await tx.booking.create({
        data: {
          code: bookingCode(),
          turfId: v.turf.id,
          configId: v.config.id,
          userId: null,
          source: req.source,
          status: "CONFIRMED",
          confirmedAt: new Date(),
          startAt: v.startAt,
          endAt: v.endAt,
          durationMinutes: req.durationMinutes,
          totalPrice: v.price,
          advanceAmount: 0,
          onlineAmount: 0,
          balanceDue: Math.max(0, v.price - (req.amountCollected ?? 0)),
          balanceCollectedAt: req.amountCollected && req.amountCollected >= v.price ? new Date() : null,
          balanceCollectedBy: req.amountCollected ? actor.id : null,
          policySnapshot: turfPolicy(v.turf, s),
          customerName: req.customerName,
          customerPhone: req.customerPhone,
          teamName: req.teamName?.trim() || null,
          notes: req.notes,
        },
      });
      await insertOccupancy(tx, v.unitIds, v.startAt, v.endAt, { bookingId: b.id });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "MANUAL_BOOKING", entity: "Booking", entityId: b.id } });
      return b;
    });
  } catch (e) {
    if (isExclusionViolation(e)) throw new SlotConflictError();
    throw e;
  }
}

/** Block a range for maintenance / private events. configId null → entire turf. Fails if it overlaps a booking. */
export async function createBlock(actor: User, turf: Turf, opts: { configId: string | null; startAt: Date; endAt: Date; reason: string; note?: string }) {
  if (opts.endAt <= opts.startAt) throw new AppError(400, "End must be after start");
  const unitIds = opts.configId
    ? (await prisma.pitchConfigUnit.findMany({ where: { configId: opts.configId, config: { turfId: turf.id } } })).map((u) => u.unitId)
    : (await prisma.resourceUnit.findMany({ where: { turfId: turf.id } })).map((u) => u.id);
  if (!unitIds.length) throw new AppError(400, "Nothing to block");
  try {
    return await prisma.$transaction(async (tx) => {
      await releaseExpiredHolds(tx);
      const block = await tx.slotBlock.create({
        data: { turfId: turf.id, configId: opts.configId, startAt: opts.startAt, endAt: opts.endAt, reason: opts.reason, note: opts.note, createdById: actor.id },
      });
      await insertOccupancy(tx, unitIds, opts.startAt, opts.endAt, { blockId: block.id });
      return block;
    });
  } catch (e) {
    if (isExclusionViolation(e)) throw new AppError(409, "That time overlaps an existing booking or hold. Cancel or reschedule it first.", "SLOT_TAKEN");
    throw e;
  }
}

export async function removeBlock(blockId: string) {
  await prisma.slotBlock.delete({ where: { id: blockId } }); // occupancy cascades
}

// ───────────── Cancellation & reschedule ─────────────

export async function cancelBooking(actor: User, bookingId: string, reason: string, by: "customer" | "owner" | "admin") {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { payments: true, turf: true } });
  if (!b) throw new AppError(404, "Booking not found");
  if (b.status === "HELD") {
    // abandoning checkout
    await prisma.$transaction([
      prisma.booking.update({ where: { id: b.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: actor.id, cancelReason: reason } }),
      prisma.occupancy.updateMany({ where: { bookingId: b.id }, data: { released: true } }),
    ]);
    await closeGamesForBooking(prisma, b.id);
    return { refunded: 0 };
  }
  if (b.status !== "CONFIRMED") throw new AppError(400, "Only confirmed bookings can be cancelled");
  if (by === "customer" && b.startAt.getTime() <= Date.now()) throw new AppError(400, "The match has already started");
  const paid = b.payments.filter((p) => p.purpose !== "SPLIT_SHARE" && (p.status === "CAPTURED" || p.status === "PARTIALLY_REFUNDED")).reduce((a, p) => a + p.amount - p.refundedAmount, 0);
  const policy = parsePolicy(b.policySnapshot);
  const refund = by === "customer" ? customerRefund(policy, paid, b.startAt).amount : Math.floor((paid * policy.ownerCancelRefundPercent) / 100);

  const { count } = await prisma.booking.updateMany({
    where: { id: b.id, status: "CONFIRMED" },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: actor.id, cancelReason: reason },
  });
  if (count !== 1) throw new AppError(409, "Booking was already updated");
  await prisma.occupancy.updateMany({ where: { bookingId: b.id }, data: { released: true } });
  await cancelBookingJobs(prisma, b.id);
  await closeGamesForBooking(prisma, b.id);
  const refunded = await refundBooking(b.id, refund, `Cancelled by ${by}: ${reason}`, actor.id);
  await refundSplitShares(b.id, `Booking ${b.code} was cancelled`, actor.id);
  if (b.userId && by !== "customer")
    await notifyInApp(prisma, b.userId, `Booking ${b.code} cancelled by the turf`, `Refund of ₹${refunded / 100} initiated.`, `/bookings/${b.id}`);
  if (b.turf.ownerId && by === "customer") await notifyInApp(prisma, b.turf.ownerId, `Booking ${b.code} cancelled`, reason, `/owner/bookings`);
  return { refunded };
}

/** Owner reschedule: atomically moves occupancy; the DB constraint rejects conflicts. Price stays as booked. */
export async function rescheduleBooking(actor: User, bookingId: string, req: { configId: string; date: string; startMinute: number }) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b || b.status !== "CONFIRMED") throw new AppError(400, "Only confirmed bookings can be rescheduled");
  const v = await validateSlot({ turfId: b.turfId, configId: req.configId, date: req.date, startMinute: req.startMinute, durationMinutes: b.durationMinutes }, true);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.occupancy.updateMany({ where: { bookingId: b.id, released: false }, data: { released: true } });
      await insertOccupancy(tx, v.unitIds, v.startAt, v.endAt, { bookingId: b.id });
      await tx.booking.update({ where: { id: b.id }, data: { configId: v.config.id, startAt: v.startAt, endAt: v.endAt } });
      await tx.notificationJob.deleteMany({ where: { bookingId: b.id, status: "PENDING", template: { not: "BOOKING_CONFIRMED" } } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "RESCHEDULE", entity: "Booking", entityId: b.id, data: { from: b.startAt, to: v.startAt } } });
      await moveGamesForBooking(tx, b.id, v.startAt);
    });
  } catch (e) {
    if (isExclusionViolation(e)) throw new SlotConflictError();
    throw e;
  }
  if (b.userId) {
    await prisma.$transaction(async (tx) => {
      await scheduleBookingJobs(tx, b.id);
      await notifyInApp(tx, b.userId!, `Booking ${b.code} rescheduled`, `New time: ${formatIst(v.startAt)}`, `/bookings/${b.id}`);
    });
  }
}

/** Marks past confirmed bookings as completed (enables reviews). */
export async function completePastBookings() {
  return prisma.booking.updateMany({ where: { status: "CONFIRMED", endAt: { lt: new Date() } }, data: { status: "COMPLETED" } });
}

export type { Slot };
