import { intervalStatus, type OccupancyRow } from "./allocation";
import { istToUtc, weekdayOf } from "../time";

export type SlotStatus = "available" | "booked" | "held" | "blocked" | "unavailable";

export interface PricingRuleLite {
  weekdays: number[];
  startMinute: number;
  endMinute: number;
  pricePerHour: number;
  priority: number;
  label: string;
}

export interface Slot {
  startMinute: number;
  endMinute: number;
  startAt: string; // ISO
  endAt: string;
  status: SlotStatus;
  price: number; // paise
  peakLabel: string | null;
}

export interface HoursLite {
  isClosed: boolean;
  openMinute: number;
  closeMinute: number;
}

/** Hourly rate applicable at a given operating-day minute. */
export function rateAt(weekday: number, minute: number, base: number, rules: readonly PricingRuleLite[]) {
  const matches = rules
    .filter((r) => (r.weekdays.length === 0 || r.weekdays.includes(weekday)) && minute >= r.startMinute && minute < r.endMinute)
    .sort((a, b) => b.priority - a.priority);
  return matches[0] ? { rate: matches[0].pricePerHour, label: matches[0].label } : { rate: base, label: null };
}

/** Price for [startMinute, startMinute+duration) — prorated in 30-minute chunks so peak boundaries are respected. */
export function priceFor(date: string, startMinute: number, duration: number, base: number, rules: readonly PricingRuleLite[]) {
  const weekday = weekdayOf(date);
  let total = 0;
  let label: string | null = null;
  const CHUNK = 30;
  for (let m = startMinute; m < startMinute + duration; m += CHUNK) {
    const len = Math.min(CHUNK, startMinute + duration - m);
    const r = rateAt(weekday, m, base, rules);
    if (r.label) label = r.label;
    total += (r.rate * len) / 60;
  }
  return { price: Math.round(total / 100) * 100, label }; // round to whole rupees
}

export interface SlotInput {
  date: string;
  hours: HoursLite | null;
  step: number;
  duration: number;
  unitIds: string[];
  occupancy: OccupancyRow[];
  basePricePerHour: number;
  rules: PricingRuleLite[];
  now: Date;
  minNoticeMinutes: number;
}

export function generateSlots(i: SlotInput): Slot[] {
  if (!i.hours || i.hours.isClosed) return [];
  const out: Slot[] = [];
  const earliest = i.now.getTime() + i.minNoticeMinutes * 60_000;
  for (let m = i.hours.openMinute; m + i.duration <= i.hours.closeMinute; m += i.step) {
    const s = istToUtc(i.date, m);
    const e = istToUtc(i.date, m + i.duration);
    let status: SlotStatus;
    if (s.getTime() < earliest) status = "unavailable";
    else status = intervalStatus(i.unitIds, s.getTime(), e.getTime(), i.occupancy) ?? "available";
    const { price, label } = priceFor(i.date, m, i.duration, i.basePricePerHour, i.rules);
    out.push({ startMinute: m, endMinute: m + i.duration, startAt: s.toISOString(), endAt: e.toISOString(), status, price, peakLabel: label });
  }
  return out;
}
