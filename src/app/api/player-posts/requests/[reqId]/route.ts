import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError, handle } from "@/lib/errors";

/** Organiser accepts/declines. Accepted players are added to the match roster (name only — no phone shared). */
export const POST = handle(async (req, { params }) => {
  const user = await requireUser();
  const { decision } = z.object({ decision: z.enum(["ACCEPTED", "DECLINED"]) }).parse(await req.json());
  const r = await prisma.playerPostRequest.findUnique({ where: { id: params.reqId }, include: { post: true, user: true } });
  if (!r || r.post.userId !== user.id) throw new AppError(404, "Request not found");
  if (r.status !== "PENDING") throw new AppError(400, "Already answered");
  await prisma.$transaction(async (tx) => {
    await tx.playerPostRequest.update({ where: { id: r.id }, data: { status: decision } });
    if (decision === "ACCEPTED") {
      if (r.post.bookingId)
        await tx.matchPlayer.create({ data: { bookingId: r.post.bookingId, userId: r.userId, name: r.user.name ?? "Player", status: "CONFIRMED" } });
      const accepted = await tx.playerPostRequest.count({ where: { postId: r.postId, status: "ACCEPTED" } });
      if (accepted >= r.post.playersNeeded) await tx.playerPost.update({ where: { id: r.postId }, data: { status: "FILLED" } });
    }
    await tx.notification.create({
      data: {
        userId: r.userId,
        title: decision === "ACCEPTED" ? "You're in! Request accepted" : "Request declined",
        body: decision === "ACCEPTED" ? "The organiser added you to the match. Check your notifications for details." : "The organiser couldn't fit you in this time.",
        link: r.post.bookingId ? `/find-players` : undefined,
      },
    });
  });
  return NextResponse.json({ ok: true });
});
