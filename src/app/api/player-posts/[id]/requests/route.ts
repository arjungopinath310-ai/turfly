import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { requestToJoin } from "@/lib/games";
import { handle } from "@/lib/errors";

/** A player asks to join an open game, with an optional first message to the organiser. */
export const POST = handle(async (req, { params }) => {
  const user = await requireUser();
  const { message } = z.object({ message: z.string().max(300).nullish() }).parse(await req.json().catch(() => ({})));
  const r = await requestToJoin(user, params.id, message);
  return NextResponse.json({ id: r.id }, { status: 201 });
});
