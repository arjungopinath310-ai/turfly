import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { AwsClient } from "aws4fetch";

/**
 * Turf photo storage, behind one small interface so Turfly can move from one server to many without code changes:
 *
 *   STORAGE_DRIVER=disk (default)  files in UPLOAD_DIR (default <project>/uploads), served by /api/uploads/<name>.
 *                                  Fine for a single server; back the folder up with the database.
 *   STORAGE_DRIVER=s3              any S3-compatible bucket (Cloudflare R2, AWS S3, Backblaze B2, MinIO), so every
 *                                  app server sees the same photos. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID,
 *                                  S3_SECRET_ACCESS_KEY (and S3_REGION, default "auto"). With S3_PUBLIC_URL (a public
 *                                  bucket or CDN address) photos load straight from there; without it they are
 *                                  streamed through /api/uploads/<name>.
 */
export const UPLOAD_NAME = /^[a-z0-9-]{8,80}\.(jpg|png|webp)$/;
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
export const MAX_TURF_PHOTOS = 8;
export const CONTENT_TYPE: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

interface Store {
  put(name: string, bytes: Buffer, type: string): Promise<void>;
  get(name: string): Promise<Buffer | null>;
  remove(name: string): Promise<void>;
}

export const uploadDir = () => process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

const disk: Store = {
  async put(name, bytes) {
    await mkdir(uploadDir(), { recursive: true });
    await writeFile(path.join(uploadDir(), name), bytes);
  },
  async get(name) {
    try {
      return await readFile(path.join(uploadDir(), name));
    } catch {
      return null;
    }
  },
  async remove(name) {
    await unlink(path.join(uploadDir(), name)).catch(() => {});
  },
};

function s3(): Store {
  const endpoint = (process.env.S3_ENDPOINT ?? "").replace(/\/$/, "");
  const bucket = process.env.S3_BUCKET ?? "";
  const client = new AwsClient({
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    service: "s3",
    region: process.env.S3_REGION || "auto",
  });
  const url = (name: string) => `${endpoint}/${bucket}/${encodeURIComponent(name)}`; // path-style: works with R2, B2, MinIO and AWS
  return {
    async put(name, bytes, type) {
      const r = await client.fetch(url(name), { method: "PUT", body: new Uint8Array(bytes), headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable" } });
      if (!r.ok) throw new Error(`Photo storage refused the upload (${r.status})`);
    },
    async get(name) {
      const r = await client.fetch(url(name));
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`Photo storage error (${r.status})`);
      return Buffer.from(await r.arrayBuffer());
    },
    async remove(name) {
      await client.fetch(url(name), { method: "DELETE" }).catch(() => {});
    },
  };
}

let cached: Store | null = null;
const store = () => (cached ??= process.env.STORAGE_DRIVER === "s3" ? s3() : disk);
const publicBase = () => (process.env.STORAGE_DRIVER === "s3" ? (process.env.S3_PUBLIC_URL ?? "").replace(/\/$/, "") : "");

const TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { ext: "png", magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/webp": { ext: "webp", magic: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
};

/** Saves an image after checking its real format (not just the name); returns the URL to store on the turf. */
export async function saveImage(prefix: string, type: string, bytes: Buffer): Promise<string> {
  const t = TYPES[type];
  if (!t || !t.magic(bytes)) throw new Error("Only JPEG, PNG or WebP photos");
  const name = `${prefix.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30)}-${randomBytes(8).toString("hex")}.${t.ext}`;
  await store().put(name, bytes, type);
  const base = publicBase();
  return base ? `${base}/${name}` : `/api/uploads/${name}`;
}

/** The stored file name behind a photo URL that Turfly created (local route or public bucket), else null. */
export function nameFromUrl(url: string) {
  const base = publicBase();
  const m = url.match(/^\/api\/uploads\/([^/?#]+)$/) ?? (base && url.startsWith(base + "/") ? [url, url.slice(base.length + 1)] : null);
  return m && UPLOAD_NAME.test(m[1]) ? m[1] : null;
}

export async function readUpload(name: string) {
  return UPLOAD_NAME.test(name) ? store().get(name) : null;
}

export async function deleteUpload(url: string) {
  const name = nameFromUrl(url);
  if (name) await store().remove(name);
}
