import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError, handle } from "@/lib/errors";

export const dynamic = "force-dynamic";

const body = z.object({
  name: z.string().trim().min(2, "Enter your name").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email or leave it empty").max(120).optional().or(z.literal("")),
  acceptTerms: z.literal(true, { message: "Please accept the terms to continue" }),
});

/**
 * POST: finish sign-up for the signed-in person (the sign-up page calls it right after the OTP sign-in).
 * Saves their name, optional email and when they accepted the terms. Someone who already had an account
 * keeps it; their name and email are updated to what they just entered.
 */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const d = body.parse(await req.json());
  const email = d.email || null;
  if (email && email !== user.email) {
    const taken = await prisma.user.findFirst({ where: { email, id: { not: user.id } }, select: { id: true } });
    if (taken) throw new AppError(409, "That email is linked to another account. Use another one or leave it empty.", "EMAIL_TAKEN");
  }
  const existing = Boolean(user.name) && Date.now() - user.createdAt.getTime() > 10 * 60_000;
  await prisma.user.update({
    where: { id: user.id },
    data: { name: d.name, ...(email ? { email } : {}), termsAcceptedAt: user.termsAcceptedAt ?? new Date() },
  });
  // keep the person's own team-member rows in step with their name
  await prisma.teamMember.updateMany({ where: { userId: user.id }, data: { name: d.name } });
  return NextResponse.json({ ok: true, existing });
});
