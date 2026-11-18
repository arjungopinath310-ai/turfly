import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { MAX_GAME_MESSAGE, sendGameMessage, threadMessages } from "@/lib/games";
import { handle } from "@/lib/errors";

/** Chat between a game's organiser and one player who asked to join (only those two can read it). */
export const GET = handle(async (req, { params }) => {
  const user = await requireUser();
  const after = new URL(req.url).searchParams.get("after");
  const t = await threadMessages(user, params.reqId, after && !Number.isNaN(Date.parse(after)) ? new Date(after) : undefined);
  return NextResponse.json(t, { headers: { "cache-control": "no-store" } });
});

export const POST = handle(async (req, { params }) => {
  const user = await requireUser();
  const { body } = z.object({ body: z.string().min(1).max(MAX_GAME_MESSAGE) }).parse(await req.json());
  return NextResponse.json(await sendGameMessage(user, params.reqId, body), { status: 201 });
});
