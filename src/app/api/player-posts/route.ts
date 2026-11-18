import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { listGameForBooking } from "@/lib/games";
import { handle } from "@/lib/errors";

/** "Short of 3 players for my 5-a-side at 7 PM": lists (or updates) the game of one of your upcoming bookings. */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = z
    .object({
      bookingId: z.string(),
      playersNeeded: z.coerce.number().int().min(1).max(21),
      skillLevel: z.string().max(30).nullish(),
      sharePerPlayer: z.coerce.number().int().min(0).max(100_000).nullish(), // rupees
      note: z.string().max(300).nullish(),
    })
    .parse(await req.json());
  const post = await listGameForBooking(user, body.bookingId, {
    playersNeeded: body.playersNeeded,
    skillLevel: body.skillLevel,
    note: body.note,
    sharePerPlayer: body.sharePerPlayer != null ? body.sharePerPlayer * 100 : undefined,
  });
  return NextResponse.json({ id: post.id }, { status: 201 });
});
