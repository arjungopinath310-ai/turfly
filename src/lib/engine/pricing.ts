export interface OfferLite {
  discountType: "PERCENT" | "FLAT" | string;
  value: number;
  maxDiscountPaise: number | null;
}

export interface Quote {
  totalPrice: number; // venue price
  discount: number; // reduces venue price (never the advance)
  advanceAmount: number; // portion of venue price paid online
  platformFee: number; // separate line item, on top
  onlineAmount: number; // what the customer pays now
  balanceDue: number; // what the customer pays at the turf
}

export function computeDiscount(totalPrice: number, offer: OfferLite | null): number {
  if (!offer) return 0;
  let d = offer.discountType === "PERCENT" ? Math.round((totalPrice * offer.value) / 100) : offer.value;
  if (offer.maxDiscountPaise != null) d = Math.min(d, offer.maxDiscountPaise);
  return Math.max(0, Math.min(d, totalPrice));
}

/**
 * ₹1,500 slot, ₹49 advance, no fee → online ₹49, balance ₹1,451.
 * The advance is capped so it never exceeds the (discounted) venue price.
 */
export function quote(opts: {
  totalPrice: number;
  advancePaise: number;
  platformFeePaise: number;
  offer: OfferLite | null;
  payFullOnline: boolean;
}): Quote {
  const discount = computeDiscount(opts.totalPrice, opts.offer);
  const net = opts.totalPrice - discount;
  const advanceAmount = opts.payFullOnline ? net : Math.min(opts.advancePaise, net);
  return {
    totalPrice: opts.totalPrice,
    discount,
    advanceAmount,
    platformFee: opts.platformFeePaise,
    onlineAmount: advanceAmount + opts.platformFeePaise,
    balanceDue: net - advanceAmount,
  };
}

export const rupees = (paise: number) =>
  "₹" + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 });
