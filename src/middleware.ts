import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isAppUserAgent, isPublicPath } from "@/lib/access";

/**
 * Sign-in gate for every page (see src/lib/access.ts for the public exceptions).
 * Only checks that a valid session cookie exists; each page and API still checks the user's role
 * and ownership itself (pageUser / requireUser), and suspended accounts are refused there.
 */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const inApp = isAppUserAgent(req.headers.get("user-agent"));
  // The app has no use for the public landing page: signed-out users go straight to sign-in.
  if (isPublicPath(pathname) && !(inApp && pathname === "/")) return NextResponse.next();

  const secret = process.env.NEXTAUTH_SECRET;
  // The cookie is "__Secure-…" over https and plain over http (local); accept either.
  const token = secret
    ? ((await getToken({ req, secret, secureCookie: true })) ?? (await getToken({ req, secret, secureCookie: false })))
    : null;
  if (token) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  runtime: "nodejs",
  // Pages only: not API routes (they check sign-in themselves and include webhooks/cron/health),
  // not Next.js assets, and not files such as /sw.js, /icons/…, /robots.txt, /manifest.webmanifest.
  matcher: ["/((?!api/|_next/|.*\\..*).*)"],
};
