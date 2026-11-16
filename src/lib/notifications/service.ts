import { prisma, type Tx } from "../db";
import { getSettings } from "../settings";
import { formatDateLong, formatTimeRange } from "../time";
import { rupees } from "../engine/pricing";
import { describePolicy, parsePolicy } from "../engine/policy";
import { sendEmail, sendSms, sendWhatsApp } from "./providers";
import { directionsUrl } from "../share";
import { queuePush } from "../push";

const APP = () => process.env.APP_URL ?? "http://localhost:3000";

/** Every in-app notification goes through here, so it is also sent as a phone push when push is configured. */
export async function createNotification(db: Tx, data: { userId: string; title: string; body: string; link?: string | null }) {
  const n = await db.notification.create({ data: { ...data, link: data.link ?? undefined } });
  queuePush(data.userId, { title: data.title, body: data.body, link: data.link });
  return n;
}

export async function notifyInApp(db: Tx, userId: string, title: string, body: string, link?: string) {
  await createNotification(db, { userId, title, body, link });
}

/** Called inside the confirmation transaction. Idempotent thanks to @@unique(bookingId, template, channel). */
export async function scheduleBookingJobs(db: Tx, bookingId: string) {
  const s = await getSettings();
  const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const now = Date.now();
  const start = b.startAt.getTime();
  const jobs: { template: string; sendAt: Date }[] = [{ template: "BOOKING_CONFIRMED", sendAt: new Date() }];
  if (s.reminders.h24 && start - 24 * 3600_000 > now) jobs.push({ template: "REMINDER_24H", sendAt: new Date(start - 24 * 3600_000) });
  if (s.reminders.h2 && start - 2 * 3600_000 > now) jobs.push({ template: "REMINDER_2H", sendAt: new Date(start - 2 * 3600_000) });
  if (s.reminders.balance && b.balanceDue > 0 && start - 3 * 3600_000 > now)
    jobs.push({ template: "BALANCE_PENDING", sendAt: new Date(start - 3 * 3600_000) });
  const channels = ["IN_APP", ...s.reminders.channels];
  await db.notificationJob.createMany({
    data: jobs.flatMap((j) => channels.map((channel) => ({ bookingId, userId: b.userId, channel, template: j.template, sendAt: j.sendAt }))),
    skipDuplicates: true,
  });
}

export async function cancelBookingJobs(db: Tx, bookingId: string) {
  await db.notificationJob.updateMany({ where: { bookingId, status: "PENDING" }, data: { status: "CANCELLED" } });
}

function render(template: string, b: Awaited<ReturnType<typeof loadBooking>>) {
  const when = `${formatDateLong(b.startAt)}, ${formatTimeRange(b.startAt, b.endAt)}`;
  const link = `${APP()}/bookings/${b.id}`;
  const team = b.teamName ?? b.team?.name ?? "—";
  const base = `${b.turf.name} · ${b.config.name} · ${when}`;
  switch (template) {
    case "BOOKING_CONFIRMED":
      return {
        title: `Booking confirmed · ${b.code}`,
        body: `${base}. Team: ${team}. Paid ${rupees(b.onlineAmount)} online, ${rupees(b.balanceDue)} due at the turf.`,
        html: `<h2>Booking confirmed — ${b.code}</h2>
<p><b>${b.turf.name}</b><br>${b.turf.addressLine}, ${b.turf.city.name}</p>
<p>${when}<br>${b.config.name} · Team: ${team}</p>
<p>Paid online: ${rupees(b.onlineAmount)}<br>Balance at venue: ${rupees(b.balanceDue)}</p>
<p><a href="${directionsUrl(b.turf)}">Directions</a> · <a href="${link}">View booking</a></p>
<p style="color:#555">${describePolicy(parsePolicy(b.policySnapshot), b.advanceAmount).join("<br>")}</p>`,
        params: [b.code, b.turf.name, when, team, rupees(b.onlineAmount), rupees(b.balanceDue), link],
      };
    case "REMINDER_24H":
    case "REMINDER_2H":
      return {
        title: `Match ${template === "REMINDER_24H" ? "tomorrow" : "in 2 hours"} · ${b.turf.name}`,
        body: `${base}. Booking ${b.code}. Directions: ${directionsUrl(b.turf)}`,
        html: `<p>Reminder: ${base}. Booking ${b.code}.</p><p><a href="${directionsUrl(b.turf)}">Directions</a></p>`,
        params: [b.turf.name, when, b.code, directionsUrl(b.turf)],
      };
    case "BALANCE_PENDING":
      return {
        title: `Balance ${rupees(b.balanceDue)} due at the turf`,
        body: `Please pay ${rupees(b.balanceDue)} at ${b.turf.name} before your match (${when}).`,
        html: `<p>Please pay ${rupees(b.balanceDue)} at ${b.turf.name} before your match (${when}).</p>`,
        params: [rupees(b.balanceDue), b.turf.name, when],
      };
    default:
      return { title: template, body: base, html: `<p>${base}</p>`, params: [base] };
  }
}

const loadBooking = (id: string) =>
  prisma.booking.findUniqueOrThrow({ where: { id }, include: { turf: { include: { city: true } }, config: true, team: true, user: true } });

/** Processes due jobs. Called by /api/cron/tick every minute. */
export async function processDueJobs(limit = 50) {
  const due = await prisma.notificationJob.findMany({
    where: { status: "PENDING", sendAt: { lte: new Date() }, attempts: { lt: 5 } },
    orderBy: { sendAt: "asc" },
    take: limit,
  });
  let sent = 0;
  for (const job of due) {
    // claim the job (prevents double-send when two cron workers overlap)
    const { count } = await prisma.notificationJob.updateMany({ where: { id: job.id, status: "PENDING" }, data: { status: "SENDING", attempts: { increment: 1 } } });
    if (count === 0) continue;
    try {
      if (!job.bookingId) throw new Error("job without booking");
      const b = await loadBooking(job.bookingId);
      const stillRelevant =
        b.status === "CONFIRMED" && (job.template !== "BALANCE_PENDING" || (b.balanceDue > 0 && !b.balanceCollectedAt));
      if (!stillRelevant) {
        await prisma.notificationJob.update({ where: { id: job.id }, data: { status: "SKIPPED" } });
        continue;
      }
      const msg = render(job.template, b);
      const u = b.user;
      if (job.channel === "IN_APP" && u) await notifyInApp(prisma, u.id, msg.title, msg.body, `/bookings/${b.id}`);
      if (job.channel === "SMS" && u?.phone) await sendSms(u.phone, `${msg.title}. ${msg.body}`);
      if (job.channel === "WHATSAPP" && u?.phone) await sendWhatsApp(u.phone, job.template, msg.params);
      if (job.channel === "EMAIL" && u?.email) await sendEmail(u.email, msg.title, msg.html);
      await prisma.notificationJob.update({ where: { id: job.id }, data: { status: "SENT", sentAt: new Date() } });
      sent++;
    } catch (e) {
      await prisma.notificationJob.update({
        where: { id: job.id },
        data: { status: job.attempts + 1 >= 5 ? "FAILED" : "PENDING", error: String((e as Error).message).slice(0, 500), sendAt: new Date(Date.now() + 60_000) },
      });
    }
  }
  return { processed: due.length, sent };
}
