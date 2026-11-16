import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteAccount, exportAccount } from "@/lib/account";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** GET: download all your data as JSON. */
export const GET = handle(async () => {
  const user = await requireUser();
  const data = await exportAccount(user);
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="turfly-my-data-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "no-store" },
  });
});

/** DELETE: permanently delete your account (body: { confirm: "DELETE" }). */
export const DELETE = handle(async (req) => {
  const user = await requireUser();
  z.object({ confirm: z.literal("DELETE", { message: 'Type DELETE to confirm' }) }).parse(await req.json());
  await deleteAccount(user);
  return NextResponse.json({ ok: true });
});
