// WhatsApp / calendar / maps helpers. Usable on server and client.
import { formatDateLong, formatTimeRange } from "./time";

const APP = () => process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000";

export const whatsappShare = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

export const directionsUrl = (t: { lat: number; lng: number }) =>
  `https://www.google.com/maps/dir/?api=1&destination=${t.lat},${t.lng}`;

const gcalStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function googleCalendarUrl(b: { code: string; startAt: Date | string; endAt: Date | string; turfName: string; address: string; configName: string }) {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: `Football · ${b.turfName} (${b.configName})`,
    dates: `${gcalStamp(new Date(b.startAt))}/${gcalStamp(new Date(b.endAt))}`,
    details: `Booking ${b.code}`,
    location: b.address,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

export function bookingShareText(b: { code: string; startAt: Date | string; endAt: Date | string; turfName: string; configName: string; teamName?: string | null; lat: number; lng: number; id: string }) {
  return [
    `⚽ Match booked at ${b.turfName}`,
    `${formatDateLong(b.startAt)} · ${formatTimeRange(b.startAt, b.endAt)}`,
    `${b.configName}${b.teamName ? ` · Team ${b.teamName}` : ""}`,
    `Booking ID: ${b.code}`,
    `Directions: ${directionsUrl(b)}`,
  ].join("\n");
}

export const turfShareText = (t: { name: string; slug: string }) => `Check out ${t.name} on Turfly: ${APP()}/turfs/${t.slug}`;
export const teamInviteUrl = (token: string) => `${APP()}/join/team/${token}`;
