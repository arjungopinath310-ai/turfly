import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { markRead } from "@/lib/chat";
import { handle } from "@/lib/errors";

export const POST = handle(async (_req, { params }) => {
  const user = await requireUser();
  await markRead(user, params.id);
  return NextResponse.json({ ok: true });
});
