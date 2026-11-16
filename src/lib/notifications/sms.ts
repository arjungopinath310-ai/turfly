/**
 * SMS templates for India's DLT rules (TRAI). Every SMS must match a template registered on a DLT portal,
 * word for word, with {#var#} where values go (each value at most 30 characters).
 *
 * This file is the single source of truth: the app fills these templates, and
 * `npx tsx scripts/make-sms-docs.ts` prints the exact texts to register (docs/sms-templates.txt + PDF).
 *
 * Plain ASCII only ("Rs." not "₹", "-" not "–"): one non-ASCII character switches the SMS to Unicode,
 * which halves its length (70 instead of 160 characters) and doubles the cost.
 */
import { addDays } from "../time";

export type SmsKey = "OTP" | "BOOKING_CONFIRMED" | "REMINDER" | "BALANCE_PENDING";

export interface SmsTemplate {
  key: SmsKey;
  name: string; // template name to use on the DLT portal and in MSG91
  env: string; // .env variable holding the MSG91 template ID
  text: string; // DLT text with {#var#}
  vars: string[]; // what each {#var#} is, in order
  example: string[];
}

export const SMS_TEMPLATES: SmsTemplate[] = [
  {
    key: "OTP",
    name: "turfly_login_otp",
    env: "MSG91_OTP_TEMPLATE_ID",
    text: "{#var#} is your Turfly login OTP. It is valid for 5 minutes. Do not share it with anyone. - Turfly",
    vars: ["6-digit code"],
    example: ["482913"],
  },
  {
    key: "BOOKING_CONFIRMED",
    name: "turfly_booking_confirmed",
    env: "MSG91_TPL_BOOKING_CONFIRMED",
    text: "Booking {#var#} confirmed: {#var#}, {#var#}. Paid Rs.{#var#} online, Rs.{#var#} due at turf. - Turfly",
    vars: ["booking ID", "turf name", "date and time", "amount paid online", "amount due at the turf"],
    example: ["TF-QZM8TJ", "Kickoff Fives Manjeri", "Tue 17 Nov, 8:00-9:00 PM", "49", "951"],
  },
  {
    key: "REMINDER",
    name: "turfly_match_reminder",
    env: "MSG91_TPL_REMINDER",
    text: "Reminder: your match at {#var#} is {#var#}, {#var#}. Booking {#var#}. See you on the pitch! - Turfly",
    vars: ["turf name", "today / tomorrow / in 2 hours", "date and time", "booking ID"],
    example: ["Kickoff Fives Manjeri", "tomorrow", "Tue 17 Nov, 8:00-9:00 PM", "TF-QZM8TJ"],
  },
  {
    key: "BALANCE_PENDING",
    name: "turfly_balance_due",
    env: "MSG91_TPL_BALANCE_PENDING",
    text: "Please pay the balance of Rs.{#var#} at {#var#} before your match on {#var#}. Booking {#var#}. - Turfly",
    vars: ["balance amount", "turf name", "date and time", "booking ID"],
    example: ["951", "Kickoff Fives Manjeri", "Tue 17 Nov, 8:00-9:00 PM", "TF-QZM8TJ"],
  },
];

export const smsTemplate = (key: SmsKey) => SMS_TEMPLATES.find((t) => t.key === key)!;

/** Notification job template → SMS template (both reminders share one DLT template). */
export function smsKeyFor(job: string): SmsKey | null {
  if (job === "BOOKING_CONFIRMED" || job === "BALANCE_PENDING") return job;
  if (job === "REMINDER_24H" || job === "REMINDER_2H") return "REMINDER";
  return null;
}

/** ASCII-only and at most 30 characters (DLT variable limit). */
export function smsValue(v: string, max = 30) {
  const ascii = v
    .normalize("NFKD")
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return ascii.length > max ? ascii.slice(0, max - 1).trimEnd() + "." : ascii;
}

/** 145100 → "1,451"; 2450 → "24.50" (shown after "Rs."). */
export const smsAmount = (paise: number) =>
  (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 });

const IST = "Asia/Kolkata";
const timeOf = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true }).format(d);
const istDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(d); // YYYY-MM-DD

/** "Tue 17 Nov, 8:00-9:00 PM" (or "11:00 AM-12:00 PM" when AM/PM differ). */
export function smsWhen(start: Date, end: Date) {
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: IST, weekday: "short", day: "numeric", month: "short" }).format(start).replace(",", "");
  const [s, e] = [timeOf(start), timeOf(end)];
  const range = s.slice(-2) === e.slice(-2) ? `${s.slice(0, -3)}-${e}` : `${s}-${e}`;
  return `${day}, ${range}`;
}

/** "today" / "tomorrow" / "in 2 hours" for the reminder template. */
export function smsRelative(job: string, start: Date, now = new Date()) {
  if (job === "REMINDER_2H") return "in 2 hours";
  const today = istDate(now);
  const d = istDate(start);
  return d === today ? "today" : d === addDays(today, 1) ? "tomorrow" : "coming up";
}

export interface SmsBooking {
  code: string;
  startAt: Date;
  endAt: Date;
  onlineAmount: number;
  balanceDue: number;
  turf: { name: string };
}

/** Values for each {#var#} of the job's template, in order. */
export function smsVars(job: string, b: SmsBooking, now = new Date()): string[] {
  const when = smsWhen(b.startAt, b.endAt);
  const turf = b.turf.name;
  const vals =
    job === "BOOKING_CONFIRMED"
      ? [b.code, turf, when, smsAmount(b.onlineAmount), smsAmount(b.balanceDue)]
      : job === "BALANCE_PENDING"
        ? [smsAmount(b.balanceDue), turf, when, b.code]
        : [turf, smsRelative(job, b.startAt, now), when, b.code];
  return vals.map((v) => smsValue(v));
}

/** The final SMS text (what the phone shows); used for logs and tests. */
export function renderSms(key: SmsKey, vars: string[]) {
  let i = 0;
  return smsTemplate(key).text.replace(/\{#var#\}/g, () => vars[i++] ?? "");
}

/** MSG91 template text: the same words with ##var1##, ##var2##… (##OTP## for the OTP template). */
export function msg91Text(t: SmsTemplate) {
  let i = 0;
  return t.text.replace(/\{#var#\}/g, () => (t.key === "OTP" ? "##OTP##" : `##var${++i}##`));
}
