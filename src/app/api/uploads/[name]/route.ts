import { CONTENT_TYPE, readUpload } from "@/lib/uploads";

/** Serves uploaded turf photos. Names are random and never reused, so they can be cached for a year. */
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const file = await readUpload(name);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file), {
    headers: {
      "content-type": CONTENT_TYPE[name.split(".").pop()!] ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
