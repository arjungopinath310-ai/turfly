import { NextResponse } from "next/server";
import { z } from "zod";
import { discoverAround } from "@/lib/discover";
import { AppError, handle } from "@/lib/errors";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const perIp = new Map<string, number[]>();
const PER_IP_HOUR = 30;

/**
 * POST { lat, lng }: list the turfs around this point from the public map (open to everyone, signed in or not).
 * Answers within ~50 s; a slower lookup keeps going and the next call sees its result.
 */
export const POST = handle(async (req) => {
  const { lat, lng } = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).parse(await req.json());
  const ip = clientIp(req) ?? "unknown";
  const now = Date.now();
  const hits = (perIp.get(ip) ?? []).filter((t) => t > now - 3_600_000);
  if (hits.length >= PER_IP_HOUR) throw new AppError(429, "Too many requests. Try again later.");
  hits.push(now);
  if (perIp.size > 5000) perIp.clear();
  perIp.set(ip, hits);

  const job = discoverAround(lat, lng).catch((e) => {
    console.error("[discover]", String(e));
    return { status: "failed" as const, added: 0 };
  });
  const r = await Promise.race([job, new Promise<{ status: "pending"; added: 0 }>((res) => setTimeout(() => res({ status: "pending", added: 0 }), 50_000))]);
  return NextResponse.json(r);
});
