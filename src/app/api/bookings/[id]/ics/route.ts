import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError, handle } from "@/lib/errors";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/[,;\\]/g, (m) => "\\" + m).replace(/\n/g, "\\n");

export const GET = handle(async (_req, { params }) => {
  const user = await requireUser();
  const b = await prisma.booking.findUnique({ where: { id: params.id }, include: { turf: { include: { city: true } }, config: true } });
  if (!b || b.userId !== user.id) throw new AppError(404, "Booking not found");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Turfly//Booking//EN",
    "BEGIN:VEVENT",
    `UID:${b.id}@turfly`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(b.startAt)}`,
    `DTEND:${stamp(b.endAt)}`,
    `SUMMARY:${esc(`Football · ${b.turf.name} (${b.config.name})`)}`,
    `LOCATION:${esc(`${b.turf.addressLine}, ${b.turf.city.name}`)}`,
    `DESCRIPTION:${esc(`Booking ${b.code}`)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Match in 2 hours",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return new Response(ics, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="${b.code}.ics"` } });
});
