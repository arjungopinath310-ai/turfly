import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { respondToRequest, withdrawRequest } from "@/lib/games";
import { handle } from "@/lib/errors";

/**
 * POST {decision}: the organiser accepts (player joins the squad) or declines.
 * POST {withdraw: true}: the player cancels their request or leaves the game.
 */
export const POST = handle(async (req, { params }) => {
  const user = await requireUser();
  const body = z.union([z.object({ decision: z.enum(["ACCEPTED", "DECLINED"]) }), z.object({ withdraw: z.literal(true) })]).parse(await req.json());
  if ("withdraw" in body) await withdrawRequest(user, params.reqId);
  else await respondToRequest(user, params.reqId, body.decision);
  return NextResponse.json({ ok: true });
});
