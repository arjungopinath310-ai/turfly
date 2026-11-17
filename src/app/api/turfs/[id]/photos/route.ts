import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTurfAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError, handle } from "@/lib/errors";
import { deleteUpload, MAX_TURF_PHOTOS, MAX_UPLOAD_BYTES, saveImage } from "@/lib/uploads";

/**
 * A turf's photos (the turf's owner, or an admin). The first photo is the thumbnail everywhere.
 *   POST   multipart "photo"     → add one photo
 *   PATCH  { cover: url }        → make that photo the first (thumbnail)
 *   DELETE ?url=<photo url>      → remove a photo
 */
const done = async (turfId: string, slug: string) => {
  revalidatePath(`/turfs/${slug}`);
  revalidatePath(`/owner/turfs/${turfId}`);
  const t = await prisma.turf.findUnique({ where: { id: turfId }, select: { photos: true } });
  return NextResponse.json({ photos: t?.photos ?? [] });
};

export const POST = handle(async (req, { params }) => {
  const { turf } = await requireTurfAccess(params.id);
  if (turf.photos.length >= MAX_TURF_PHOTOS) throw new AppError(400, `Up to ${MAX_TURF_PHOTOS} photos per turf. Remove one first.`);
  const file = (await req.formData()).get("photo");
  if (!(file instanceof File)) throw new AppError(400, "Choose a photo");
  if (file.size > MAX_UPLOAD_BYTES) throw new AppError(400, "That photo is too large (max 3 MB)");
  let url: string;
  try {
    url = await saveImage(turf.slug, file.type, Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    throw new AppError(400, (e as Error).message);
  }
  await prisma.turf.update({ where: { id: turf.id }, data: { photos: { push: url } } });
  return done(turf.id, turf.slug);
});

export const PATCH = handle(async (req, { params }) => {
  const { turf } = await requireTurfAccess(params.id);
  const { cover } = z.object({ cover: z.string() }).parse(await req.json());
  if (!turf.photos.includes(cover)) throw new AppError(404, "Photo not found");
  await prisma.turf.update({ where: { id: turf.id }, data: { photos: [cover, ...turf.photos.filter((p) => p !== cover)] } });
  return done(turf.id, turf.slug);
});

export const DELETE = handle(async (req, { params }) => {
  const { turf } = await requireTurfAccess(params.id);
  const url = new URL(req.url).searchParams.get("url") ?? "";
  if (!turf.photos.includes(url)) throw new AppError(404, "Photo not found");
  await prisma.turf.update({ where: { id: turf.id }, data: { photos: turf.photos.filter((p) => p !== url) } });
  await deleteUpload(url);
  return done(turf.id, turf.slug);
});
