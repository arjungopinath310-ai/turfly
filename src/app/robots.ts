import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return {
    rules: [{ userAgent: "*", allow: ["/", "/turfs", "/legal/"], disallow: ["/api/", "/admin", "/owner", "/checkout", "/bookings", "/messages", "/profile", "/teams", "/notifications", "/join/", "/claim/"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
