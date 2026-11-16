import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError, handle } from "@/lib/errors";

/** A player asks to join an open post. */
export const POST = handle(async (req, { params }) => {
  const user = await requireUser();
  const { message } = z.object({ message: z.string().max(300).optional() }).parse(await req.json().catch(() => ({})));
  const post = await prisma.playerPost.findUnique({ where: { id: params.id } });
  if (!post || post.status !== "OPEN" || post.startAt < new Date()) throw new AppError(400, "This post is no longer open");
  if (post.userId === user.id) throw new AppError(400, "This is your own post");
  await prisma.playerPostRequest.upsert({
    where: { postId_userId: { postId: post.id, userId: user.id } },
    create: { postId: post.id, userId: user.id, message },
    update: { message },
  });
  await prisma.notification.create({
    data: { userId: post.userId, title: `${user.name ?? "A player"} wants to join your match`, body: message ?? "", link: "/find-players?mine=1" },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
});
