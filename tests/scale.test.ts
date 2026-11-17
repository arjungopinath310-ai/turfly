import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { boundingBox, haversineKm, mapLimit } from "@/lib/search";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const ENV_KEYS = ["STORAGE_DRIVER", "UPLOAD_DIR", "S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_REGION", "S3_PUBLIC_URL"];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of ENV_KEYS) (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("search helpers for many turfs", () => {
  it("the 'near me' box contains every point within the radius", () => {
    const c = { lat: 11.12, lng: 76.12 };
    const b = boundingBox(c.lat, c.lng, 10);
    for (let i = 0; i < 200; i++) {
      const a = (i / 200) * 2 * Math.PI;
      const p = { lat: c.lat + (Math.sin(a) * 9.9) / 111.32, lng: c.lng + (Math.cos(a) * 9.9) / (111.32 * Math.cos((c.lat * Math.PI) / 180)) };
      expect(haversineKm(c, p)).toBeLessThan(10);
      expect(p.lat >= b.minLat && p.lat <= b.maxLat && p.lng >= b.minLng && p.lng <= b.maxLng).toBe(true);
    }
  });

  it("mapLimit keeps order and never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([5, 1, 4, 2, 3, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, n));
      running--;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30, 60, 70]);
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe("photo storage", () => {
  it("disk: saves, reads back and deletes; rejects files that aren't images", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "turfly-up-"));
    process.env.UPLOAD_DIR = dir;
    delete process.env.STORAGE_DRIVER;
    const up = await import("@/lib/uploads");
    const url = await up.saveImage("Club Arena", "image/png", PNG);
    expect(url).toMatch(/^\/api\/uploads\/clubarena-[0-9a-f]{16}\.png$/);
    const name = up.nameFromUrl(url)!;
    expect((await up.readUpload(name))?.equals(PNG)).toBe(true);
    await up.deleteUpload(url);
    expect(await up.readUpload(name)).toBeNull();
    await expect(up.saveImage("x", "image/png", Buffer.from("<script>"))).rejects.toThrow(/JPEG, PNG or WebP/);
    expect(up.nameFromUrl("/api/uploads/../../.env")).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });

  it("s3: signed PUT/GET/DELETE to the bucket, public URL when configured", async () => {
    Object.assign(process.env, {
      STORAGE_DRIVER: "s3",
      S3_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
      S3_BUCKET: "turfly-photos",
      S3_ACCESS_KEY_ID: "AKIDEXAMPLE",
      S3_SECRET_ACCESS_KEY: "secret",
      S3_PUBLIC_URL: "https://photos.example.in",
    });
    const calls: { method: string; url: string; auth: string | null }[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init);
      calls.push({ method: req.method, url: req.url, auth: req.headers.get("authorization") });
      return new Response(req.method === "GET" ? new Uint8Array(PNG) : null, { status: 200 });
    });
    const up = await import("@/lib/uploads");
    const url = await up.saveImage("Club Arena", "image/png", PNG);
    expect(url).toMatch(/^https:\/\/photos\.example\.in\/clubarena-[0-9a-f]{16}\.png$/);
    const name = up.nameFromUrl(url)!;
    expect(name).toMatch(/^clubarena-/);
    expect((await up.readUpload(name))?.equals(PNG)).toBe(true);
    await up.deleteUpload(url);
    expect(calls.map((c) => c.method)).toEqual(["PUT", "GET", "DELETE"]);
    expect(calls[0].url).toBe(`https://acct.r2.cloudflarestorage.com/turfly-photos/${name}`);
    expect(calls.every((c) => c.auth?.startsWith("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/"))).toBe(true);
  });
});
