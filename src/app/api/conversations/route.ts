import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { listConversations, sendMessage, startAsOwner, startAsPlayer, unreadMessageCount } from "@/lib/chat";
import { handle } from "@/lib/errors";

export const GET = handle(async () => {
  const user = await requireUser();
  const [conversations, unread] = await Promise.all([listConversations(user), unreadMessageCount(user.id)]);
  return NextResponse.json({ conversations, unread }, { headers: { "cache-control": "no-store" } });
});

/**
 * Start (or reuse) a conversation.
 *   Player: { turfId, bookingId?, body? }
 *   Owner:  { turfId, playerId, bookingId?, body? }
 */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const b = z
    .object({ turfId: z.string(), playerId: z.string().optional(), bookingId: z.string().nullish(), body: z.string().max(2000).optional() })
    .parse(await req.json());
  const c = b.playerId ? await startAsOwner(user, b.turfId, b.playerId, b.bookingId) : await startAsPlayer(user, b.turfId, b.bookingId);
  if (b.body?.trim()) await sendMessage(user, c.id, b.body);
  return NextResponse.json({ id: c.id }, { status: 201 });
});
