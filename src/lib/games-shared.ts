/**
 * Open games ("short of players"): rules shared by the server and the booking screen.
 * A player who booked a slot but is short lists the game; players without a team see it, ask to join,
 * chat with the organiser, and the organiser accepts. Money stays between players (paid at the turf).
 */

import { addDays, istParts, todayIst } from "./time";

export type GameStatus = "DRAFT" | "OPEN" | "FILLED" | "CLOSED";

/** A team plays with `playersPerSide`; the organiser is one of the 2 × playersPerSide players. */
export const maxPlayersNeeded = (playersPerSide: number) => Math.max(1, Math.min(21, playersPerSide * 2 - 1));

/** Suggested share per player, in paise: the turf price split over everyone on the pitch, rounded to ₹10. */
export function suggestShare(totalPricePaise: number, playersPerSide: number) {
  if (totalPricePaise <= 0 || playersPerSide <= 0) return 0;
  return Math.round(totalPricePaise / (playersPerSide * 2) / 1000) * 1000;
}

export const spotsLeft = (playersNeeded: number, accepted: number) => Math.max(0, playersNeeded - accepted);

/** "1 spot left" / "3 spots left" / "Full" */
export const spotsLabel = (n: number) => (n <= 0 ? "Full" : `${n} spot${n === 1 ? "" : "s"} left`);

export const SKILL_LEVELS = ["Casual", "Intermediate", "Competitive"] as const;

/** wa.me link for an Indian number in E.164 ("+9198…" → "https://wa.me/9198…"). */
export const whatsappLink = (phone: string, text?: string) =>
  `https://wa.me/${phone.replace(/\D/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

/** "Today" / "Tomorrow" / "Sat 22 Nov", in India time. */
export function dayWord(startAt: Date | string, now = new Date()) {
  const d = istParts(new Date(startAt)).date;
  const today = todayIst(now);
  if (d === today) return "Today";
  if (d === addDays(today, 1)) return "Tomorrow";
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
