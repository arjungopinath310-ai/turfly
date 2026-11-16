import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic"; // the public address can change, so read it per request

/** Public pages only (everything else needs sign-in, see src/lib/access.ts). */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return [
    { url: `${base}/about`, changeFrequency: "monthly", priority: 1 },
    ...["/legal/terms", "/legal/privacy", "/legal/refunds", "/contact"].map((p) => ({ url: `${base}${p}`, changeFrequency: "monthly" as const, priority: 0.3 })),
  ];
}
