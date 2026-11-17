import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isPublicPath } from "@/lib/access";
import { prisma } from "@/lib/db";

const SESSION_COOKIES = ["__Secure-next-auth.session-token", "next-auth.session-token"];

// Accounts confirmed active are remembered briefly, so a page view doesn't always cost a database lookup.
// A suspension or deletion therefore takes effect within ACTIVE_TTL_MS here (pages and APIs re-check the user).
const ACTIVE_TTL_MS = 30_000;
const MAX_CACHED = 10_000;
const active = new Map<string, number>(); // user id → valid until

async function isActive(uid: string) {
  const until = active.get(uid);
  if (until && until > Date.now()) return true;
  const ok = Boolean(await prisma.user.findFirst({ where: { id: uid, isSuspended: false }, select: { id: true } }));
  if (ok) {
    if (active.size >= MAX_CACHED) active.clear();
    active.set(uid, Date.now() + ACTIVE_TTL_MS);
  } else active.delete(uid);
  return ok;
}

/**
 * Sign-in gate for every page, the home page included (see src/lib/access.ts for the public exceptions).
 * A page opens only with a valid session cookie whose account still exists and is not suspended;
 * a cookie for a deleted or suspended account is removed and the visitor is sent to sign in.
 * Each page and API still checks the user's role and ownership itself (pageUser / requireUser).
 */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const secret = process.env.NEXTAUTH_SECRET;
  // The cookie is "__Secure-…" over https and plain over http (local); accept either.
  const token = secret
    ? ((await getToken({ req, secret, secureCookie: true })) ?? (await getToken({ req, secret, secureCookie: false })))
    : null;
  const uid = typeof token?.uid === "string" ? token.uid : null;
  if (uid) {
    try {
      if (await isActive(uid)) return NextResponse.next();
    } catch {
      // Database unreachable: don't sign everyone out over a blip; the page itself will show the error.
      return NextResponse.next();
    }
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  const res = NextResponse.redirect(url);
  if (token) {
    for (const name of SESSION_COOKIES) res.cookies.set(name, "", { maxAge: 0, path: "/", httpOnly: true, sameSite: "lax", secure: name.startsWith("__Secure-") });
  }
  return res;
}

export const config = {
  runtime: "nodejs",
  // Pages only: not API routes (they check sign-in themselves and include webhooks/cron/health),
  // not Next.js assets, and not files such as /sw.js, /icons/…, /robots.txt, /manifest.webmanifest.
  matcher: ["/((?!api/|_next/|.*\\..*).*)"],
};
