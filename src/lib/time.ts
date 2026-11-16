// IST helpers. India has one time zone and no DST, so a fixed +05:30 offset is exact.
export const IST_OFFSET_MIN = 330;
export const TZ = "Asia/Kolkata";

/** "YYYY-MM-DD" (IST calendar date) + minutes from IST midnight (may exceed 1440) → UTC Date */
export function istToUtc(date: string, minute: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, minute - IST_OFFSET_MIN));
}

export function istParts(dt: Date) {
  const s = new Date(dt.getTime() + IST_OFFSET_MIN * 60_000);
  return {
    date: s.toISOString().slice(0, 10),
    minute: s.getUTCHours() * 60 + s.getUTCMinutes(),
    weekday: s.getUTCDay(),
  };
}

export function todayIst(now = new Date()): string {
  return istParts(now).date;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date + "T00:00:00Z"));
}

/** 1110 → "6:30 PM"; 1500 → "1:00 AM" */
export function formatMinute(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm.toString().padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** 1080 → "6 PM", 1110 → "6:30 PM" */
export function shortTime(min: number): string {
  const full = formatMinute(min);
  return full.replace(":00 ", " ");
}

/** Compact slot label: (1080, 1140) → "6–7 PM"; (660, 720) → "11 AM–12 PM"; (1110, 1200) → "6:30–8 PM" */
export function slotRange(start: number, end: number): string {
  const a = shortTime(start);
  const b = shortTime(end);
  const sa = a.slice(-2);
  return sa === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}

export function formatIst(dt: Date | string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, ...opts }).format(new Date(dt));
}

export function formatTimeRange(start: Date | string, end: Date | string) {
  const s = istParts(new Date(start));
  const e = istParts(new Date(end));
  return `${formatMinute(s.minute)} – ${formatMinute(e.minute)}`;
}

export function formatDateLong(dt: Date | string) {
  return formatIst(dt, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function relativeTime(dt: Date | string, now = new Date()): string {
  const diff = (now.getTime() - new Date(dt).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}
