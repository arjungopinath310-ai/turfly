import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Public pages only: home, search, every live or unclaimed turf, and the legal pages. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const turfs = await prisma.turf.findMany({ where: { status: { in: ["APPROVED", "UNCLAIMED"] } }, select: { slug: true, updatedAt: true } }).catch(() => []);
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/turfs`, changeFrequency: "daily", priority: 0.9 },
    ...turfs.map((t) => ({ url: `${base}/turfs/${t.slug}`, lastModified: t.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
    ...["/legal/terms", "/legal/privacy", "/legal/refunds", "/contact"].map((p) => ({ url: `${base}${p}`, changeFrequency: "monthly" as const, priority: 0.3 })),
  ];
}
