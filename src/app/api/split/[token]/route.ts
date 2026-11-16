import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/errors";
import { shareStatusFor } from "@/lib/split";

/** Polled by the share page while the payer waits for the gateway webhook. */
export const GET = handle(async (_req, { params }) => {
  const user = await requireUser();
  return NextResponse.json(await shareStatusFor(user, params.token), { headers: { "cache-control": "no-store" } });
});
