/**
 * Sign-in is required for the whole app, including the home page: signed-out visitors land on /login.
 * These pages stay public because payment gateways (Razorpay website checks), Google sign-in
 * verification and the Play Store review must be able to open them without an account. None of them
 * shows turfs, prices of turfs or any other part of the app. Everything else redirects to /login and
 * comes back afterwards. Pure functions: used by the middleware and by tests.
 */
const PUBLIC_EXACT = new Set(["/login", "/signup", "/about", "/contact", "/account/delete"]);
const PUBLIC_PREFIXES = ["/legal/"];

export function isPublicPath(pathname: string) {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return PUBLIC_EXACT.has(p) || PUBLIC_PREFIXES.some((x) => p.startsWith(x));
}

/** Only same-site paths: blocks open redirects like "//evil.com" or "/\evil.com". */
export function safeNext(next: string | null | undefined, fallback = "/") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}

/**
 * Which side of Turfly someone sees: "player" (find and book turfs) or "owner" (run a turf).
 * Chosen on the sign-in page and remembered in a cookie; without a choice, turf owners see the owner side.
 * It only changes menus and the landing page. Permissions still come from the user's role and turf ownership.
 */
export type View = "player" | "owner";
export const VIEW_COOKIE = "turfly_view";
export const VIEW_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function resolveView(role: string | null | undefined, chosen: string | null | undefined): View {
  if (chosen === "owner" || chosen === "player") return chosen;
  return role === "OWNER" ? "owner" : "player";
}

/** Where each side starts after signing in. */
export const homeFor = (view: View) => (view === "owner" ? "/owner" : "/");

/** The Turfly Android/iOS app's WebView adds "TurflyApp/<version>" to its user agent. */
export const isAppUserAgent = (ua: string | null | undefined) => Boolean(ua && /TurflyApp\//.test(ua));
