import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError, handle } from "@/lib/errors";
import { MAX_UPLOAD_BYTES, saveImage } from "@/lib/uploads";

const PER_DAY = 10;
const PENDING_PER_TURF = 3;

/**
 * POST multipart "photo": a signed-in player adds a photo of a listed turf. It appears on the turf after an
 * admin approves it (Admin > Turfs > Photos from players). Owners add photos of their own turf in Turf settings.
 */
export const POST = handle(async (req, { params }) => {
  const user = await requireUser();
  const turf = await prisma.turf.findUnique({ where: { id: params.id }, select: { id: true, slug: true, status: true, isSandbox: true, ownerId: true } });
  if (!turf || turf.isSandbox || !["APPROVED", "UNCLAIMED"].includes(turf.status)) throw new AppError(404, "Turf not found");
  if (turf.ownerId === user.id) throw new AppError(400, "Add photos of your own turf in Turf settings.");
  const [today, waiting] = await Promise.all([
    prisma.turfPhotoSuggestion.count({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 86_400_000) } } }),
    prisma.turfPhotoSuggestion.count({ where: { userId: user.id, turfId: turf.id, status: "PENDING" } }),
  ]);
  if (today >= PER_DAY) throw new AppError(429, "That's plenty of photos for today. Thanks! Try again tomorrow.");
  if (waiting >= PENDING_PER_TURF) throw new AppError(400, "We're still checking your photos of this turf. You can add more once they're live.");
  const file = (await req.formData()).get("photo");
  if (!(file instanceof File)) throw new AppError(400, "Choose a photo");
  if (file.size > MAX_UPLOAD_BYTES) throw new AppError(400, "That photo is too large (max 3 MB)");
  let url: string;
  try {
    url = await saveImage(`${turf.slug}-p`, file.type, Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    throw new AppError(400, (e as Error).message);
  }
  await prisma.turfPhotoSuggestion.create({ data: { turfId: turf.id, userId: user.id, url } });
  return NextResponse.json({ ok: true });
});
