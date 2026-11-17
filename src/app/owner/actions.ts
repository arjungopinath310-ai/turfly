"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireTurfAccess, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { slugify } from "@/lib/ids";
import { normalizePhone } from "@/lib/otp";
import { convertiblePitchLayout, singlePitchLayout, type Layout } from "@/lib/engine/allocation";
import { cancelBooking, createBlock, createManualBooking, removeBlock, rescheduleBooking } from "@/lib/engine/booking";
import { policySchema } from "@/lib/engine/policy";
import { istToUtc } from "@/lib/time";
import { decodeDigipin } from "@/lib/digipin";

export type ActionState = { ok?: string; error?: string } | null;

/** Wraps an action so domain errors become form messages instead of crashes. */
async function run(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const ok = await fn();
    return { ok: ok || "Saved" };
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Invalid input" };
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    console.error(e);
    return { error: "Something went wrong" };
  }
}

const rupeesToPaise = (v: FormDataEntryValue | number | null) => Math.round(Number(v ?? 0) * 100);
const timeToMin = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
};

// ───────────── Registration & claiming ─────────────

const turfFields = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().max(1500).optional(),
  cityId: z.string(),
  addressLine: z.string().trim().max(200).optional(),
  locality: z.string().trim().min(2, "Enter the area or a landmark").max(80),
  pincode: z.string().regex(/^\d{6}$/, "PIN code must be 6 digits"),
  digipin: z.string().transform((v, ctx) => {
    const pos = decodeDigipin(v);
    if (!pos) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter the turf's DIGIPIN (10 characters) or tap “Use my location”" });
    return pos ?? { lat: 0, lng: 0 };
  }),
  phone: z.string().max(16).optional(),
  whatsapp: z.string().max(16).optional(),
  email: z.string().email().optional().or(z.literal("")),
  photos: z.string().max(4000).optional(),
});

function parseTurf(fd: FormData) {
  const d = turfFields.parse(Object.fromEntries(fd));
  const photos = (d.photos ?? "").split(/\s+/).filter((u) => /^https:\/\//.test(u)).slice(0, 8);
  return {
    name: d.name,
    description: d.description || null,
    cityId: d.cityId,
    // The form no longer asks for a street address (the DIGIPIN pinpoints the turf); an existing one is kept.
    addressLine: d.addressLine || undefined,
    locality: d.locality,
    pincode: d.pincode,
    lat: d.digipin.lat,
    lng: d.digipin.lng,
    phone: d.phone ? normalizePhone(d.phone) ?? d.phone : null,
    whatsapp: d.whatsapp ? normalizePhone(d.whatsapp) : null,
    email: d.email || null,
    photos,
    amenities: fd.getAll("amenities").map(String).slice(0, 20),
  };
}

export async function registerTurf(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await run(async () => {
    const user = await requireUser();
    const data = parseTurf(fd);
    const preset = String(fd.get("preset") ?? "convertible");
    const price = rupeesToPaise(fd.get("price") || 1200);
    const halfPrice = rupeesToPaise(fd.get("halfPrice") || 800);
    const layout: Layout =
      preset === "single5" ? singlePitchLayout(5, price) : preset === "single7" ? singlePitchLayout(7, price) : convertiblePitchLayout({ halvesSimultaneous: true, allowCombined: true, fullPricePerHour: price, halfPricePerHour: halfPrice });
    let slug = slugify(data.name);
    if (await prisma.turf.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    const turf = await prisma.$transaction(async (tx) => {
      const t = await tx.turf.create({ data: { ...data, addressLine: data.addressLine ?? data.locality, slug, ownerId: user.id, status: "DRAFT", availabilityMode: "LIVE" } });
      await tx.operatingHours.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ turfId: t.id, weekday, openMinute: 360, closeMinute: 1440 })) });
      await applyLayout(tx, t.id, layout);
      if (user.role === "PLAYER") await tx.user.update({ where: { id: user.id }, data: { role: "OWNER" } });
      return t;
    });
    id = turf.id;
  });
  if (res?.error) return res;
  redirect(`/owner/turfs/${id}?created=1`);
}

export async function claimListing(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    const { token, evidence } = z.object({ token: z.string(), evidence: z.string().trim().min(10, "Tell us how we can verify you (GST / licence no., role)").max(1000) }).parse(Object.fromEntries(fd));
    const turf = await prisma.turf.findUnique({ where: { claimToken: token } });
    if (!turf || turf.status !== "UNCLAIMED") throw new AppError(404, "This claim link is no longer valid");
    const pending = await prisma.turfClaim.findFirst({ where: { turfId: turf.id, userId: user.id, status: "PENDING" } });
    if (pending) return "Your claim is already under review";
    await prisma.turfClaim.create({ data: { turfId: turf.id, userId: user.id, evidence } });
    return "Claim submitted. An admin will verify and transfer the listing to you.";
  });
}

/** An owner found their turf among the public listings (Owner → "Find my turf") and asks to manage it. */
export async function requestClaim(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    const { turfId, evidence } = z
      .object({ turfId: z.string(), evidence: z.string().trim().min(10, "Tell us your name, your role at the turf and its phone number").max(1000) })
      .parse(Object.fromEntries(fd));
    const turf = await prisma.turf.findUnique({ where: { id: turfId } });
    if (!turf || turf.status !== "UNCLAIMED") throw new AppError(404, "This turf is already managed by someone. Contact us if that's wrong.");
    const pending = await prisma.turfClaim.findFirst({ where: { turfId, userId: user.id, status: "PENDING" } });
    if (pending) return "We already have your request. We'll call you soon.";
    await prisma.turfClaim.create({ data: { turfId, userId: user.id, evidence } });
    revalidatePath("/owner");
    revalidatePath("/owner/claim");
    return "Request sent. We'll call the turf to confirm, then it appears in your dashboard.";
  });
}

export async function updateTurf(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { turf } = await requireTurfAccess(String(fd.get("turfId")));
    const data = parseTurf(fd);
    const ops = z
      .object({
        slotStepMinutes: z.coerce.number().int().refine((v) => [15, 30, 60].includes(v)),
        minNoticeMinutes: z.coerce.number().int().min(0).max(1440),
        maxAdvanceDays: z.coerce.number().int().min(1).max(90),
      })
      .parse(Object.fromEntries(fd));
    const durations = fd.getAll("durations").map(Number).filter((d) => [30, 60, 90, 120, 150, 180].includes(d));
    if (!durations.length) throw new AppError(400, "Pick at least one booking duration");
    // Durations must fill whole slots, otherwise a booking leaves an unbookable gap (e.g. 90 min on a 1-hour grid).
    const bad = durations.filter((d) => d % ops.slotStepMinutes !== 0);
    if (bad.length) throw new AppError(400, `With ${ops.slotStepMinutes}-minute slots, durations must be multiples of ${ops.slotStepMinutes} (remove ${bad.join(", ")} min)`);
    await prisma.turf.update({
      where: { id: turf.id },
      data: { ...data, ...ops, allowedDurations: durations.sort((a, b) => a - b), fullOnlinePaymentEnabled: fd.get("fullOnline") === "on" },
    });
    revalidatePath(`/owner/turfs/${turf.id}`);
  });
}

export async function submitForReview(turfId: string): Promise<ActionState> {
  return run(async () => {
    const { turf } = await requireTurfAccess(turfId);
    if (!["DRAFT", "REJECTED"].includes(turf.status)) throw new AppError(400, "Already submitted");
    const configs = await prisma.pitchConfig.count({ where: { turfId, isActive: true } });
    if (!configs) throw new AppError(400, "Add at least one pitch configuration first");
    await prisma.turf.update({ where: { id: turfId }, data: { status: "PENDING_REVIEW", rejectionReason: null } });
    revalidatePath(`/owner/turfs/${turfId}`);
    return "Submitted for approval. We'll notify you once it's live.";
  });
}

export async function setAvailabilityMode(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { turf } = await requireTurfAccess(String(fd.get("turfId")));
    const mode = z.enum(["LIVE", "OWNER_REPORTED"]).parse(fd.get("mode"));
    await prisma.turf.update({ where: { id: turf.id }, data: { availabilityMode: mode, availabilityUpdatedAt: new Date() } });
    revalidatePath(`/owner/turfs/${turf.id}`);
  });
}

// ───────────── Pitch layout (resource model) ─────────────

async function applyLayout(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], turfId: string, layout: Layout) {
  const unitIds: Record<string, string> = {};
  for (const [i, u] of layout.units.entries()) {
    const row = await tx.resourceUnit.create({ data: { turfId, name: u.name, isVirtual: Boolean(u.isVirtual), sortOrder: i } });
    unitIds[u.key] = row.id;
  }
  for (const [i, c] of layout.configs.entries()) {
    await tx.pitchConfig.create({
      data: { turfId, name: c.name, playersPerSide: c.playersPerSide, basePricePerHour: c.basePricePerHour, sortOrder: i, units: { create: c.unitKeys.map((k) => ({ unitId: unitIds[k] })) } },
    });
  }
}

async function assertNoFutureBookings(turfId: string) {
  const n = await prisma.booking.count({ where: { turfId, status: { in: ["HELD", "CONFIRMED"] }, endAt: { gt: new Date() } } });
  if (n) throw new AppError(400, `There are ${n} upcoming bookings. Layout presets replace all pitches, so edit pitches individually instead.`);
}

export async function applyPreset(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { turf } = await requireTurfAccess(String(fd.get("turfId")));
    await assertNoFutureBookings(turf.id);
    const preset = String(fd.get("preset"));
    const layout =
      preset === "convertible"
        ? convertiblePitchLayout({
            halvesSimultaneous: fd.get("simultaneous") === "on",
            allowCombined: fd.get("combined") === "on",
            fullPricePerHour: rupeesToPaise(fd.get("price")),
            halfPricePerHour: rupeesToPaise(fd.get("halfPrice")),
          })
        : singlePitchLayout(Number(fd.get("pps") ?? 5), rupeesToPaise(fd.get("price")));
    await prisma.$transaction(async (tx) => {
      // Past bookings keep their config rows; deactivate instead of deleting where referenced.
      const referenced = await tx.booking.findMany({ where: { turfId: turf.id }, select: { configId: true }, distinct: ["configId"] });
      const keep = new Set(referenced.map((r) => r.configId));
      await tx.pitchConfig.updateMany({ where: { turfId: turf.id, id: { in: Array.from(keep) } }, data: { isActive: false } });
      await tx.pitchConfig.deleteMany({ where: { turfId: turf.id, id: { notIn: Array.from(keep) } } });
      await tx.pitchConfigUnit.deleteMany({ where: { config: { turfId: turf.id } } });
      await tx.resourceUnit.deleteMany({ where: { turfId: turf.id } });
      await applyLayout(tx, turf.id, layout);
    });
    revalidatePath(`/owner/turfs/${turf.id}`);
    return "Layout applied";
  });
}

export async function addUnit(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { turf } = await requireTurfAccess(String(fd.get("turfId")));
    const name = z.string().trim().min(1).max(40).parse(fd.get("name"));
    const count = await prisma.resourceUnit.count({ where: { turfId: turf.id } });
    await prisma.resourceUnit.create({ data: { turfId: turf.id, name, isVirtual: fd.get("virtual") === "on", sortOrder: count } });
    revalidatePath(`/owner/turfs/${turf.id}`);
  });
}

export async function deleteUnit(turfId: string, unitId: string): Promise<ActionState> {
  return run(async () => {
    await requireTurfAccess(turfId);
    const used = await prisma.occupancy.count({ where: { unitId, released: false, endAt: { gt: new Date() } } });
    if (used) throw new AppError(400, "This area has upcoming bookings or blocks");
    await prisma.resourceUnit.delete({ where: { id: unitId, turfId } });
    revalidatePath(`/owner/turfs/${turfId}`);
  });
}

export async function saveConfig(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { turf } = await requireTurfAccess(String(fd.get("turfId")));
    const d = z
      .object({ id: z.string().optional(), name: z.string().trim().min(2).max(60), playersPerSide: z.coerce.number().int().min(3).max(11), price: z.coerce.number().min(0).max(100000) })
      .parse(Object.fromEntries(fd));
    const unitIds = fd.getAll("units").map(String);
    if (!unitIds.length) throw new AppError(400, "Select at least one area this pitch uses");
    const valid = await prisma.resourceUnit.count({ where: { turfId: turf.id, id: { in: unitIds } } });
    if (valid !== unitIds.length) throw new AppError(400, "Invalid area");
    const data = { name: d.name, playersPerSide: d.playersPerSide, basePricePerHour: Math.round(d.price * 100), isActive: fd.get("active") !== "off" };
    if (d.id) {
      const existing = await prisma.pitchConfig.findFirst({ where: { id: d.id, turfId: turf.id }, include: { units: true } });
      if (!existing) throw new AppError(404, "Pitch not found");
      const changedUnits = existing.units.map((u) => u.unitId).sort().join() !== [...unitIds].sort().join();
      if (changedUnits) {
        const upcoming = await prisma.booking.count({ where: { configId: d.id, status: { in: ["HELD", "CONFIRMED"] }, endAt: { gt: new Date() } } });
        if (upcoming) throw new AppError(400, "Can't change the areas of a pitch with upcoming bookings");
      }
      await prisma.$transaction([
        prisma.pitchConfig.update({ where: { id: d.id }, data }),
        ...(changedUnits ? [prisma.pitchConfigUnit.deleteMany({ where: { configId: d.id } }), prisma.pitchConfigUnit.createMany({ data: unitIds.map((unitId) => ({ configId: d.id!, unitId })) })] : []),
      ]);
    } else {
      const count = await prisma.pitchConfig.count({ where: { turfId: turf.id } });
      await prisma.pitchConfig.create({ data: { ...data, turfId: turf.id, sortOrder: count, units: { create: unitIds.map((unitId) => ({ unitId })) } } });
    }
    revalidatePath(`/owner/turfs/${turf.id}`);
  });
}

// ───────────── Pricing, hours, policy ─────────────

export async function addPricingRule(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { turf } = await requireTurfAccess(String(fd.get("turfId")));
    const d = z.object({ configId: z.string(), label: z.string().trim().min(1).max(30), start: z.string(), end: z.string(), price: z.coerce.number().min(0).max(100000) }).parse(Object.fromEntries(fd));
    const cfg = await prisma.pitchConfig.findFirst({ where: { id: d.configId, turfId: turf.id } });
    if (!cfg) throw new AppError(404, "Pitch not found");
    let startMinute = timeToMin(d.start);
    let endMinute = timeToMin(d.end);
    if (endMinute <= startMinute) endMinute += 1440; // crosses midnight
    if (startMinute < 360 && endMinute <= 360) { startMinute += 1440; endMinute += 1440; } // early-morning hours belong to the previous operating day
    const weekdays = fd.getAll("weekdays").map(Number);
    await prisma.pricingRule.create({ data: { configId: cfg.id, label: d.label, startMinute, endMinute, pricePerHour: Math.round(d.price * 100), weekdays, priority: weekdays.length ? 2 : 1 } });
    revalidatePath(`/owner/turfs/${turf.id}`);
  });
}

export async function deletePricingRule(turfId: string, ruleId: string): Promise<ActionState> {
  return run(async () => {
    await requireTurfAccess(turfId);
    await prisma.pricingRule.deleteMany({ where: { id: ruleId, config: { turfId } } });
    revalidatePath(`/owner/turfs/${turfId}`);
  });
}

export async function saveHours(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { turf } = await requireTurfAccess(String(fd.get("turfId")));
    const rows = [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
      const closed = fd.get(`closed_${weekday}`) === "on";
      const open = timeToMin(String(fd.get(`open_${weekday}`) || "06:00"));
      let close = timeToMin(String(fd.get(`close_${weekday}`) || "23:00"));
      if (close <= open) close += 1440; // closes after midnight
      if (close > 1800) throw new AppError(400, "Closing time can be at most 6:00 AM the next day");
      return { weekday, isClosed: closed, openMinute: open, closeMinute: close };
    });
    await prisma.$transaction(rows.map((r) => prisma.operatingHours.upsert({ where: { turfId_weekday: { turfId: turf.id, weekday: r.weekday } }, create: { ...r, turfId: turf.id }, update: r })));
    revalidatePath(`/owner/turfs/${turf.id}`);
  });
}

export async function savePolicy(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { turf } = await requireTurfAccess(String(fd.get("turfId")));
    if (fd.get("useDefault") === "on") {
      await prisma.$executeRaw`UPDATE "Turf" SET "cancellationPolicy" = NULL WHERE id = ${turf.id}`;
    } else {
      const tiers = [0, 1, 2]
        .filter((i) => String(fd.get(`h_${i}`) ?? "") !== "" && String(fd.get(`p_${i}`) ?? "") !== "")
        .map((i) => ({ minHoursBefore: Number(fd.get(`h_${i}`)), refundPercent: Number(fd.get(`p_${i}`)) }));
      const policy = policySchema.parse({ tiers, ownerCancelRefundPercent: 100, note: String(fd.get("note") ?? "") || undefined });
      await prisma.turf.update({ where: { id: turf.id }, data: { cancellationPolicy: policy } });
    }
    revalidatePath(`/owner/turfs/${turf.id}`);
    return "Policy saved. Applies to new bookings only.";
  });
}

// ───────────── Calendar operations ─────────────

export async function blockSlot(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { user, turf } = await requireTurfAccess(String(fd.get("turfId")));
    const d = z.object({ date: z.string(), endDate: z.string().optional(), start: z.string(), end: z.string(), configId: z.string(), reason: z.enum(["MAINTENANCE", "PRIVATE_EVENT", "HOLIDAY", "OTHER"]), note: z.string().max(200).optional() }).parse(Object.fromEntries(fd));
    const s = timeToMin(d.start);
    let e = timeToMin(d.end);
    const endDate = d.endDate || d.date;
    if (endDate === d.date && e <= s) e += 1440;
    await createBlock(user, turf, { configId: d.configId === "ALL" ? null : d.configId, startAt: istToUtc(d.date, s), endAt: istToUtc(endDate, e), reason: d.reason, note: d.note });
    revalidatePath("/owner/calendar");
    return "Blocked";
  });
}

export async function unblock(turfId: string, blockId: string): Promise<ActionState> {
  return run(async () => {
    await requireTurfAccess(turfId);
    const b = await prisma.slotBlock.findFirst({ where: { id: blockId, turfId } });
    if (!b) throw new AppError(404, "Block not found");
    await removeBlock(blockId);
    revalidatePath("/owner/calendar");
  });
}

export async function walkIn(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { user, turf } = await requireTurfAccess(String(fd.get("turfId")));
    const d = z
      .object({
        configId: z.string(),
        date: z.string(),
        start: z.string(),
        duration: z.coerce.number().int(),
        customerName: z.string().trim().min(1).max(60),
        customerPhone: z.string().max(16).optional(),
        teamName: z.string().max(60).optional(),
        source: z.enum(["WALK_IN", "PHONE"]),
        collected: z.coerce.number().min(0).optional(),
      })
      .parse(Object.fromEntries(fd));
    const b = await createManualBooking(user, {
      turfId: turf.id,
      configId: d.configId,
      date: d.date,
      startMinute: timeToMin(d.start),
      durationMinutes: d.duration,
      customerName: d.customerName,
      customerPhone: d.customerPhone ? normalizePhone(d.customerPhone) ?? undefined : undefined,
      teamName: d.teamName,
      source: d.source,
      amountCollected: d.collected ? Math.round(d.collected * 100) : 0,
    });
    revalidatePath("/owner/calendar");
    return `Booked ${b.code}. Online calendar updated.`;
  });
}

async function ownerBooking(bookingId: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) throw new AppError(404, "Booking not found");
  const { user } = await requireTurfAccess(b.turfId);
  return { b, user };
}

export async function collectBalance(bookingId: string): Promise<ActionState> {
  return run(async () => {
    const { b, user } = await ownerBooking(bookingId);
    if (b.status !== "CONFIRMED" && b.status !== "COMPLETED") throw new AppError(400, "Booking is not active");
    await prisma.booking.update({ where: { id: b.id }, data: { balanceCollectedAt: new Date(), balanceCollectedBy: user.id } });
    await prisma.auditLog.create({ data: { actorId: user.id, action: "BALANCE_COLLECTED", entity: "Booking", entityId: b.id, data: { amount: b.balanceDue } } });
    revalidatePath("/owner/bookings");
    return "Balance marked as collected";
  });
}

export async function markNoShow(bookingId: string): Promise<ActionState> {
  return run(async () => {
    const { b } = await ownerBooking(bookingId);
    if (b.startAt > new Date()) throw new AppError(400, "Match hasn't started yet");
    await prisma.booking.update({ where: { id: b.id }, data: { status: "NO_SHOW" } });
    revalidatePath("/owner/bookings");
  });
}

export async function ownerCancel(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { b, user } = await ownerBooking(String(fd.get("bookingId")));
    const reason = z.string().trim().min(3, "Give the customer a reason").max(300).parse(fd.get("reason"));
    const r = await cancelBooking(user, b.id, reason, user.role === "ADMIN" ? "admin" : "owner");
    revalidatePath("/owner/bookings");
    return `Cancelled. Refunded ₹${r.refunded / 100}.`;
  });
}

export async function ownerReschedule(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { b, user } = await ownerBooking(String(fd.get("bookingId")));
    const d = z.object({ configId: z.string(), date: z.string(), start: z.string() }).parse(Object.fromEntries(fd));
    await rescheduleBooking(user, b.id, { configId: d.configId, date: d.date, startMinute: timeToMin(d.start) });
    revalidatePath("/owner/bookings");
    return "Rescheduled. Customer notified.";
  });
}
