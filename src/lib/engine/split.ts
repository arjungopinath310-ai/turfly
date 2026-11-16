/**
 * Split payment maths (pure). The organiser's advance confirms the booking; the venue price is then split
 * into equal whole-rupee shares. Friends pay their share online; the organiser keeps the remainder
 * (their advance already counts towards it, the rest is paid at the venue).
 */
export const SPLIT_MIN_PLAYERS = 2;
export const SPLIT_MAX_PLAYERS = 30;
export const SPLIT_MIN_SHARE = 1000; // ₹10 in paise

export interface SplitBooking {
  totalPrice: number;
  discount: number;
  advanceAmount: number;
  balanceDue: number;
}

export type SplitResult =
  | { ok: true; players: number; friends: number; shareAmount: number; friendsTotal: number; organiserShare: number; organiserAtVenue: number }
  | { ok: false; error: string };

export function computeSplit(b: SplitBooking, players: number): SplitResult {
  if (!Number.isInteger(players) || players < SPLIT_MIN_PLAYERS || players > SPLIT_MAX_PLAYERS)
    return { ok: false, error: `Choose between ${SPLIT_MIN_PLAYERS} and ${SPLIT_MAX_PLAYERS} players` };
  const value = b.totalPrice - b.discount;
  const shareAmount = Math.floor(value / players / 100) * 100; // whole rupees, rounded down; organiser absorbs the paise
  if (shareAmount < SPLIT_MIN_SHARE) return { ok: false, error: "Each share would be less than ₹10. Choose fewer players." };
  const friends = players - 1;
  const friendsTotal = shareAmount * friends;
  if (friendsTotal > b.balanceDue)
    return { ok: false, error: "Too many players: the friends' shares would be more than the balance due at the venue." };
  return { ok: true, players, friends, shareAmount, friendsTotal, organiserShare: value - friendsTotal, organiserAtVenue: b.balanceDue - friendsTotal };
}
