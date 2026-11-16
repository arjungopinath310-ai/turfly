/**
 * Best-effort client IP. Cloudflare (tunnel or proxy) sets CF-Connecting-IP; other proxies set X-Forwarded-For.
 * Only used for abuse limits, never for authentication.
 */
export function clientIp(req: Request): string | null {
  const h = req.headers;
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip");
  return ip?.trim().slice(0, 64) || null;
}

/** True when the request comes from the Turfly Android/iOS app (its WebView user agent carries "TurflyApp/"). */
export const isNativeApp = (ua: string | null | undefined) => Boolean(ua && /TurflyApp\//.test(ua));
