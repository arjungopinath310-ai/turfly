import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { quoteSlot } from "@/lib/engine/booking";
import { describePolicy, refundabilityLabel } from "@/lib/engine/policy";
import { handle } from "@/lib/errors";
import { coinBalance, coinsUsable } from "@/lib/coins";

const schema = z.object({
  configId: z.string(),
  date: z.string(),
  startMinute: z.number().int(),
  durationMinutes: z.number().int(),
  offerCode: z.string().optional(),
  payFullOnline: z.boolean().optional(),
});

/** Price breakdown + refund policy, shown before the customer reserves. */
export const POST = handle(async (req, { params }) => {
  const body = schema.parse(await req.json());
  const user = await currentUser();
  const q = await quoteSlot({ ...body, turfId: params.id, userId: user?.id });
  return NextResponse.json({
    quote: q.quote,
    offer: q.offer ? { code: q.offer.code, title: q.offer.title } : null,
    policy: { label: refundabilityLabel(q.policy), lines: describePolicy(q.policy, q.quote.onlineAmount) },
    holdMinutes: q.settings.holdMinutes,
    // Turf coins the player could put towards this booking's online advance
    coins: user ? await (async () => {
      const balance = await coinBalance(user.id);
      const usable = coinsUsable(balance, q.quote.onlineAmount, q.settings.coinValuePaise);
      return { balance, usable, valuePaise: usable * q.settings.coinValuePaise };
    })() : null,
  });
});
