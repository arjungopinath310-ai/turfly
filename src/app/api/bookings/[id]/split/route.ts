import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/errors";
import { cancelSplit, createSplit } from "@/lib/split";
import { SPLIT_MAX_PLAYERS, SPLIT_MIN_PLAYERS } from "@/lib/engine/split";

/** Organiser creates (or, while nobody has paid, changes) the split for a confirmed booking. */
export const POST = handle(async (req, { params }) => {
  const user = await requireUser();
  const { players } = z.object({ players: z.number().int().min(SPLIT_MIN_PLAYERS).max(SPLIT_MAX_PLAYERS) }).parse(await req.json());
  const plan = await createSplit(user, params.id, players);
  return NextResponse.json({ token: plan.token, players: plan.players, shareAmount: plan.shareAmount });
});

/** Organiser stops the split (only while nobody has paid). */
export const DELETE = handle(async (_req, { params }) => {
  const user = await requireUser();
  await cancelSplit(user, params.id);
  return NextResponse.json({ ok: true });
});
