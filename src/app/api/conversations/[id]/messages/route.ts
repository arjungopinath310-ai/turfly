import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { sendMessage, threadMessages } from "@/lib/chat";
import { handle } from "@/lib/errors";

/** Thread messages. `?after=<ISO>` returns only newer messages (used for polling). */
export const GET = handle(async (req, { params }) => {
  const user = await requireUser();
  const after = new URL(req.url).searchParams.get("after");
  const afterDate = after && !Number.isNaN(Date.parse(after)) ? new Date(after) : undefined;
  return NextResponse.json(await threadMessages(user, params.id, afterDate), { headers: { "cache-control": "no-store" } });
});

export const POST = handle(async (req, { params }) => {
  const user = await requireUser();
  const { body } = z.object({ body: z.string().max(2000) }).parse(await req.json());
  const m = await sendMessage(user, params.id, body);
  return NextResponse.json({ id: m.id, createdAt: m.createdAt }, { status: 201 });
});
