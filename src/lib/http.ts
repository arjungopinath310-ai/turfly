/**
 * Best-effort client IP. Cloudflare (tunnel or proxy) sets CF-Connecting-IP; other proxies set X-Forwarded-For.
 * Only used for abuse limits, never for authentication.
 */
export function clientIp(req: Request): string | null {
  const h = req.headers;
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip");
  return ip?.trim().slice(0, 64) || null;
}
