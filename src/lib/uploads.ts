import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Turf photos are files on the server (the Next.js public folder only serves files that existed at build time).
 * They live in UPLOAD_DIR (default: <project>/uploads) and are served by /api/uploads/<name>.
 * Back this folder up together with the database.
 */
export const uploadDir = () => process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
export const UPLOAD_NAME = /^[a-z0-9-]{8,80}\.(jpg|png|webp)$/;
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
export const MAX_TURF_PHOTOS = 8;

const TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { ext: "png", magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/webp": { ext: "webp", magic: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
};
export const CONTENT_TYPE: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Saves an image after checking its real format (not just the name); returns the public URL. */
export async function saveImage(prefix: string, type: string, bytes: Buffer): Promise<string> {
  const t = TYPES[type];
  if (!t || !t.magic(bytes)) throw new Error("Only JPEG, PNG or WebP photos");
  const name = `${prefix.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30)}-${randomBytes(8).toString("hex")}.${t.ext}`;
  await mkdir(uploadDir(), { recursive: true });
  await writeFile(path.join(uploadDir(), name), bytes);
  return `/api/uploads/${name}`;
}

export const nameFromUrl = (url: string) => {
  const m = url.match(/^\/api\/uploads\/([^/?#]+)$/);
  return m && UPLOAD_NAME.test(m[1]) ? m[1] : null;
};

export async function readUpload(name: string) {
  if (!UPLOAD_NAME.test(name)) return null;
  try {
    return await readFile(path.join(uploadDir(), name));
  } catch {
    return null;
  }
}

export async function deleteUpload(url: string) {
  const name = nameFromUrl(url);
  if (name) await unlink(path.join(uploadDir(), name)).catch(() => {});
}
