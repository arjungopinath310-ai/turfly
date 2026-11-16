import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/errors";
import { clientIp } from "@/lib/http";
import { requestOtp } from "@/lib/otp";

export const POST = handle(async (req) => {
  const { phone } = z.object({ phone: z.string().min(10).max(16) }).parse(await req.json());
  const r = await requestOtp(phone, clientIp(req));
  return NextResponse.json({ ok: true, ...r });
});
