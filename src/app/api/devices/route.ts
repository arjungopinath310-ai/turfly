import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handle } from "@/lib/errors";

const schema = z.object({ token: z.string().min(20).max(4096), platform: z.enum(["android", "ios", "web"]), appVersion: z.string().max(40).optional() });

/** The app registers its push token after sign-in. A token moves to whoever is signed in on that device now. */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const b = schema.parse(await req.json());
  await prisma.deviceToken.upsert({
    where: { token: b.token },
    create: { token: b.token, platform: b.platform, appVersion: b.appVersion, userId: user.id },
    update: { userId: user.id, platform: b.platform, appVersion: b.appVersion, lastSeenAt: new Date() },
  });
  return NextResponse.json({ ok: true });
});

/** Called on sign-out so a shared phone stops receiving the previous user's notifications. */
export const DELETE = handle(async (req) => {
  const user = await requireUser();
  const { token } = z.object({ token: z.string().max(4096) }).parse(await req.json());
  await prisma.deviceToken.deleteMany({ where: { token, userId: user.id } });
  return NextResponse.json({ ok: true });
});
