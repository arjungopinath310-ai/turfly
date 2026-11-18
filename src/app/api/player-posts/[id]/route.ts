import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { updateGame } from "@/lib/games";
import { handle } from "@/lib/errors";

/** Organiser edits their game: spots needed, note, share per player; or closes / reopens it. */
export const PATCH = handle(async (req, { params }) => {
  const user = await requireUser();
  const body = z
    .object({
      playersNeeded: z.number().int().min(1).max(21).optional(),
      note: z.string().max(300).nullish(),
      skillLevel: z.string().max(30).nullish(),
      sharePerPlayer: z.number().int().min(0).max(100_000).nullish(), // rupees
      action: z.enum(["close", "reopen"]).optional(),
    })
    .parse(await req.json());
  const post = await updateGame(user, params.id, {
    ...body,
    sharePerPlayer: body.sharePerPlayer === undefined ? undefined : body.sharePerPlayer === null ? null : body.sharePerPlayer * 100,
  });
  return NextResponse.json({ id: post.id, status: post.status });
});
