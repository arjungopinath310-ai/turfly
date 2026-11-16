"use server";
import { createNotification } from "@/lib/notifications/service";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { slugify, token } from "@/lib/ids";
import { normalizePhone } from "@/lib/otp";
import { policySchema } from "@/lib/engine/policy";
import { refundBooking } from "@/lib/payments/refunds";
import { notifyInApp } from "@/lib/notifications/service";
import { setSetting } from "@/lib/settings";
import type { ActionState } from "@/app/owner/actions";

async function admin() {
  const u = await requireUser(["ADMIN"]);
  if (u.role !== "ADMIN") throw new AppError(403, "Admins only");
  return u;
}
async function run(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    return { ok: (await fn()) || "Saved" };
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Invalid input" };
    console.error(e);
    return { error: "Something went wrong" };
  }
}
const audit = (actorId: string, action: string, entity: string, entityId: string, data?: object) =>
  prisma.auditLog.create({ data: { actorId, action, entity, entityId, data } });

// ───────────── Turfs ─────────────

export async function reviewTurf(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const a = await admin();
    const { turfId, decision, reason } = z.object({ turfId: z.string(), decision: z.enum(["APPROVED", "REJECTED", "SUSPENDED"]), reason: z.string().max(300).optional() }).parse(Object.fromEntries(fd));
    if (decision !== "APPROVED" && !reason) throw new AppError(400, "Give a reason so the owner can fix it");
    const t = await prisma.turf.update({ where: { id: turfId }, data: { status: decision, rejectionReason: decision === "APPROVED" ? null : reason } });
    if (t.ownerId) await notifyInApp(prisma, t.ownerId, decision === "APPROVED" ? `${t.name} is live! 🎉` : `${t.name}: ${decision.toLowerCase()}`, reason ?? "Customers can now find and book your turf.", `/owner/turfs/${t.id}`);
    await audit(a.id, `TURF_${decision}`, "Turf", t.id, { reason });
    revalidatePath("/admin/turfs");
    return `Turf ${decision.toLowerCase()}`;
  });
}

export async function updateTurfAdmin(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const a = await admin();
    const d = z.object({ turfId: z.string(), commission: z.string().optional() }).parse(Object.fromEntries(fd));
    const commissionPercent = d.commission === "" || d.commission == null ? null : z.coerce.number().min(0).max(50).parse(d.commission);
    await prisma.turf.update({ where: { id: d.turfId }, data: { commissionPercent, isFeatured: fd.get("featured") === "on" } });
    await audit(a.id, "TURF_COMMERCIALS", "Turf", d.turfId, { commissionPercent, featured: fd.get("featured") === "on" });
    revalidatePath("/admin/turfs");
  });
}

/** Admin adds a publicly identifiable turf as an UNCLAIMED listing (no availability, contact only). */
export async function addUnclaimedTurf(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const a = await admin();
    const d = z
      .object({
        name: z.string().trim().min(3).max(80),
        cityId: z.string(),
        addressLine: z.string().trim().min(5),
        locality: z.string().optional(),
        pincode: z.string().regex(/^\d{6}$/),
        lat: z.coerce.number(),
        lng: z.coerce.number(),
        phone: z.string().optional(),
        sourceNote: z.string().trim().min(5, "Record where this public information came from").max(300),
      })
      .parse(Object.fromEntries(fd));
    let slug = slugify(d.name);
    if (await prisma.turf.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    const t = await prisma.turf.create({
      data: {
        ...d,
        locality: d.locality || null,
        phone: d.phone ? normalizePhone(d.phone) ?? d.phone : null,
        slug,
        status: "UNCLAIMED",
        availabilityMode: "NONE",
        claimToken: token(16),
        amenities: fd.getAll("amenities").map(String),
      },
    });
    await audit(a.id, "TURF_ADD_UNCLAIMED", "Turf", t.id);
    revalidatePath("/admin/turfs");
    return "Listing added. Copy the claim link from the table to invite the owner.";
  });
}

export async function reviewClaim(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const a = await admin();
    const { claimId, decision, note } = z.object({ claimId: z.string(), decision: z.enum(["APPROVED", "REJECTED"]), note: z.string().max(300).optional() }).parse(Object.fromEntries(fd));
    const c = await prisma.turfClaim.findUniqueOrThrow({ where: { id: claimId }, include: { turf: true, user: true } });
    if (c.status !== "PENDING") throw new AppError(400, "Already reviewed");
    await prisma.$transaction(async (tx) => {
      await tx.turfClaim.update({ where: { id: c.id }, data: { status: decision, reviewNote: note, reviewedById: a.id, reviewedAt: new Date() } });
      if (decision === "APPROVED") {
        await tx.turf.update({ where: { id: c.turfId }, data: { ownerId: c.userId, status: "DRAFT", claimToken: null, isDemo: false } });
        if (c.user.role === "PLAYER") await tx.user.update({ where: { id: c.userId }, data: { role: "OWNER" } });
        await tx.turfClaim.updateMany({ where: { turfId: c.turfId, status: "PENDING", id: { not: c.id } }, data: { status: "REJECTED", reviewNote: "Another claim was approved" } });
      }
      await createNotification(tx, { userId: c.userId, title: `Claim ${decision.toLowerCase()}: ${c.turf.name}`, body: note ?? (decision === "APPROVED" ? "Set up pitches and hours, then submit for approval." : ""), link: decision === "APPROVED" ? `/owner/turfs/${c.turfId}` : undefined });
    });
    await audit(a.id, `CLAIM_${decision}`, "TurfClaim", c.id);
    revalidatePath("/admin/turfs");
  });
}

// ───────────── Users ─────────────

export async function updateUser(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const a = await admin();
    const d = z.object({ userId: z.string(), role: z.enum(["PLAYER", "OWNER", "ADMIN"]) }).parse(Object.fromEntries(fd));
    if (d.userId === a.id && d.role !== "ADMIN") throw new AppError(400, "You can't remove your own admin role");
    await prisma.user.update({ where: { id: d.userId }, data: { role: d.role, isSuspended: fd.get("suspended") === "on" } });
    await audit(a.id, "USER_UPDATE", "User", d.userId, { role: d.role, suspended: fd.get("suspended") === "on" });
    revalidatePath("/admin/users");
  });
}

// ───────────── Finance ─────────────

export async function adminRefund(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const a = await admin();
    const d = z.object({ bookingId: z.string(), amount: z.coerce.number().positive(), reason: z.string().trim().min(3).max(300), disputeId: z.string().optional() }).parse(Object.fromEntries(fd));
    const paise = Math.round(d.amount * 100);
    const refunded = await refundBooking(d.bookingId, paise, `Admin: ${d.reason}`, a.id);
    if (refunded === 0) throw new AppError(400, "Nothing refundable on this booking");
    if (d.disputeId) await prisma.dispute.update({ where: { id: d.disputeId }, data: { status: "RESOLVED", resolution: d.reason, refundAmount: refunded, resolvedAt: new Date() } });
    await audit(a.id, "ADMIN_REFUND", "Booking", d.bookingId, { refunded });
    revalidatePath("/admin/finance");
    return `Refunded ₹${refunded / 100}`;
  });
}

export async function resolveDispute(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const a = await admin();
    const d = z.object({ disputeId: z.string(), status: z.enum(["RESOLVED", "REJECTED"]), resolution: z.string().trim().min(3).max(500) }).parse(Object.fromEntries(fd));
    const dis = await prisma.dispute.update({ where: { id: d.disputeId }, data: { status: d.status, resolution: d.resolution, resolvedAt: new Date() } });
    await notifyInApp(prisma, dis.raisedById, `Your dispute was ${d.status.toLowerCase()}`, d.resolution, `/bookings/${dis.bookingId}`);
    await audit(a.id, `DISPUTE_${d.status}`, "Dispute", dis.id);
    revalidatePath("/admin/finance");
  });
}

// ───────────── Platform settings & offers ─────────────

export async function savePlatformSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const a = await admin();
    const d = z
      .object({
        advance: z.coerce.number().min(1).max(5000),
        fee: z.coerce.number().min(0).max(500),
        holdMinutes: z.coerce.number().int().min(2).max(30),
        commission: z.coerce.number().min(0).max(50),
      })
      .parse(Object.fromEntries(fd));
    const tiers = [0, 1, 2]
      .filter((i) => String(fd.get(`h_${i}`) ?? "") !== "" && String(fd.get(`p_${i}`) ?? "") !== "")
      .map((i) => ({ minHoursBefore: Number(fd.get(`h_${i}`)), refundPercent: Number(fd.get(`p_${i}`)) }));
    const channels = fd.getAll("channels").map(String).filter((c): c is "SMS" | "WHATSAPP" | "EMAIL" => ["SMS", "WHATSAPP", "EMAIL"].includes(c));
    await setSetting("advanceAmountPaise", Math.round(d.advance * 100));
    await setSetting("platformFeePaise", Math.round(d.fee * 100));
    await setSetting("holdMinutes", d.holdMinutes);
    await setSetting("defaultCommissionPercent", d.commission);
    await setSetting("defaultCancellationPolicy", policySchema.parse({ tiers, ownerCancelRefundPercent: 100 }));
    await setSetting("reminders", { h24: fd.get("h24") === "on", h2: fd.get("h2") === "on", balance: fd.get("balance") === "on", channels });
    await audit(a.id, "SETTINGS_UPDATE", "PlatformSetting", "all", d);
    revalidatePath("/admin/settings");
    return "Settings saved. New values apply to new bookings.";
  });
}

export async function createOffer(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const a = await admin();
    const d = z
      .object({
        code: z.string().trim().min(3).max(20).regex(/^[A-Za-z0-9]+$/),
        title: z.string().trim().min(3).max(80),
        kind: z.enum(["FIRST_BOOKING", "PROMO", "REPEAT", "REFERRAL"]),
        discountType: z.enum(["PERCENT", "FLAT"]),
        value: z.coerce.number().positive(),
        max: z.string().optional(),
        turfId: z.string().optional(),
        usageLimit: z.string().optional(),
        minBookings: z.string().optional(),
        validTo: z.string().optional(),
      })
      .parse(Object.fromEntries(fd));
    if (d.discountType === "PERCENT" && d.value > 100) throw new AppError(400, "Percent can't exceed 100");
    await prisma.offer.create({
      data: {
        code: d.code.toUpperCase(),
        title: d.title,
        kind: d.kind,
        discountType: d.discountType,
        value: d.discountType === "FLAT" ? Math.round(d.value * 100) : Math.round(d.value),
        maxDiscountPaise: d.max ? Math.round(Number(d.max) * 100) : null,
        turfId: d.turfId || null,
        usageLimit: d.usageLimit ? Number(d.usageLimit) : null,
        minBookings: d.minBookings ? Number(d.minBookings) : null,
        validTo: d.validTo ? new Date(d.validTo + "T23:59:59+05:30") : null,
      },
    });
    await audit(a.id, "OFFER_CREATE", "Offer", d.code);
    revalidatePath("/admin/settings");
  });
}

export async function toggleOffer(id: string): Promise<ActionState> {
  return run(async () => {
    await admin();
    const o = await prisma.offer.findUniqueOrThrow({ where: { id } });
    await prisma.offer.update({ where: { id }, data: { isActive: !o.isActive } });
    revalidatePath("/admin/settings");
  });
}
