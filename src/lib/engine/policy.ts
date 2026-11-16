import { z } from "zod";
import { rupees } from "./pricing";

export const policySchema = z.object({
  tiers: z
    .array(z.object({ minHoursBefore: z.number().min(0), refundPercent: z.number().min(0).max(100) }))
    .max(6),
  ownerCancelRefundPercent: z.number().min(0).max(100).default(100),
  note: z.string().max(500).optional(),
});
export type CancellationPolicy = z.infer<typeof policySchema>;

export const DEFAULT_POLICY: CancellationPolicy = {
  tiers: [
    { minHoursBefore: 24, refundPercent: 100 },
    { minHoursBefore: 6, refundPercent: 50 },
  ],
  ownerCancelRefundPercent: 100,
};

export function parsePolicy(v: unknown, fallback: CancellationPolicy = DEFAULT_POLICY): CancellationPolicy {
  const r = policySchema.safeParse(v);
  return r.success ? r.data : fallback;
}

/** Refund for a customer cancellation `now` for a match starting at `startAt`. */
export function customerRefund(policy: CancellationPolicy, paid: number, startAt: Date, now = new Date()) {
  const hours = (startAt.getTime() - now.getTime()) / 3_600_000;
  const tier = [...policy.tiers].sort((a, b) => b.minHoursBefore - a.minHoursBefore).find((t) => hours >= t.minHoursBefore);
  const percent = hours <= 0 ? 0 : tier?.refundPercent ?? 0;
  return { percent, amount: Math.floor((paid * percent) / 100), hoursBefore: hours };
}

/** Plain-language explanation shown BEFORE payment. */
export function describePolicy(policy: CancellationPolicy, advance: number): string[] {
  const tiers = [...policy.tiers].sort((a, b) => b.minHoursBefore - a.minHoursBefore);
  if (tiers.length === 0 || tiers.every((t) => t.refundPercent === 0))
    return [`The ${rupees(advance)} advance is non-refundable if you cancel.`, ownerLine(policy)];
  const lines: string[] = [];
  tiers.forEach((t, i) => {
    const amt = rupees(Math.floor((advance * t.refundPercent) / 100));
    const upper = i === 0 ? "" : ` and less than ${tiers[i - 1].minHoursBefore} h`;
    const what = t.refundPercent === 100 ? `full refund (${amt})` : t.refundPercent === 0 ? "no refund" : `${t.refundPercent}% refund (${amt})`;
    lines.push(`Cancel ${t.minHoursBefore} h or more${upper} before the match: ${what}.`);
  });
  const last = tiers[tiers.length - 1];
  lines.push(`Cancel less than ${last.minHoursBefore} h before: no refund of the advance.`);
  lines.push(ownerLine(policy));
  if (policy.note) lines.push(policy.note);
  return lines;
}

function ownerLine(p: CancellationPolicy) {
  return `If the turf cancels, you get ${p.ownerCancelRefundPercent}% of the amount paid online back.`;
}

export function refundabilityLabel(policy: CancellationPolicy): "Refundable" | "Partially refundable" | "Non-refundable" {
  const max = Math.max(0, ...policy.tiers.map((t) => t.refundPercent));
  if (max === 0) return "Non-refundable";
  if (max === 100) return "Refundable";
  return "Partially refundable";
}
