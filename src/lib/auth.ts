import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { getServerSession } from "next-auth";
import type { Role, User } from "@prisma/client";
import { prisma } from "./db";
import { verifyOtp } from "./otp";
import { AppError } from "./errors";
import { token } from "./ids";

const adminPhones = () => (process.env.ADMIN_PHONES ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      id: "otp",
      name: "Mobile OTP",
      credentials: { phone: { type: "text" }, code: { type: "text" } },
      async authorize(c) {
        if (!c?.phone || !c?.code) return null;
        const phone = await verifyOtp(c.phone, c.code);
        if (!phone) return null;
        const user = await prisma.user.upsert({
          where: { phone },
          create: { phone, role: adminPhones().includes(phone) ? "ADMIN" : "PLAYER", referralCode: token(5) },
          update: {},
        });
        if (user.isSuspended) return null;
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
    ...(googleEnabled
      ? [GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! })]
      : []),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      if (!user.email) return false;
      const u = await prisma.user.upsert({
        where: { email: user.email },
        create: { email: user.email, name: user.name, image: user.image, referralCode: token(5) },
        update: {},
      });
      if (u.isSuspended) return false;
      user.id = u.id;
      return true;
    },
    async jwt({ token: t, user }) {
      if (user?.id) t.uid = user.id;
      return t;
    },
    async session({ session, token: t }) {
      if (session.user) (session.user as { id?: string }).id = t.uid as string;
      return session;
    },
  },
};

/** Current user (fresh from DB so role changes / suspensions apply immediately). */
export async function currentUser(): Promise<User | null> {
  const s = await getServerSession(authOptions);
  const id = (s?.user as { id?: string } | undefined)?.id;
  if (!id) return null;
  const u = await prisma.user.findUnique({ where: { id } });
  return u && !u.isSuspended ? u : null;
}

export async function requireUser(roles?: Role[]): Promise<User> {
  const u = await currentUser();
  if (!u) throw new AppError(401, "Please sign in", "UNAUTHENTICATED");
  if (roles && !roles.includes(u.role) && u.role !== "ADMIN") throw new AppError(403, "You don't have access to this", "FORBIDDEN");
  return u;
}

/** Owner of the turf, or admin. */
export async function requireTurfAccess(turfId: string) {
  const u = await requireUser();
  const turf = await prisma.turf.findUnique({ where: { id: turfId } });
  if (!turf) throw new AppError(404, "Turf not found");
  if (u.role !== "ADMIN" && turf.ownerId !== u.id) throw new AppError(403, "Not your turf", "FORBIDDEN");
  return { user: u, turf };
}
