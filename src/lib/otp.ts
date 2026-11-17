import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";
import { AppError } from "./errors";
import { sendSms } from "./notifications/providers";
import { adminPhones, isDemoMode } from "./format";

const TTL_MIN = 5;
const MAX_ATTEMPTS = 5;
const MAX_PER_HOUR = 5;
const RESEND_SECONDS = 30;

/** Accepts 10-digit Indian mobile numbers with optional +91/0 prefix → +91XXXXXXXXXX */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? `+91${ten}` : null;
}

const hash = (phone: string, code: string) =>
  createHmac("sha256", process.env.NEXTAUTH_SECRET ?? "dev-secret").update(`${phone}:${code}`).digest("hex");

const MAX_PER_IP_HOUR = 10;
const globalPerHour = () => Number(process.env.OTP_GLOBAL_PER_HOUR ?? 500);

export async function requestOtp(rawPhone: string, ip: string | null = null): Promise<{ devCode?: string; serverLog?: boolean }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new AppError(400, "Enter a valid 10-digit Indian mobile number");
  const hourAgo = new Date(Date.now() - 3_600_000);
  // SMS-pumping protection: per-IP and platform-wide hourly ceilings on top of the per-phone limit.
  const [byIp, total] = await Promise.all([
    ip ? prisma.otpCode.count({ where: { ip, createdAt: { gt: hourAgo } } }) : Promise.resolve(0),
    prisma.otpCode.count({ where: { createdAt: { gt: hourAgo } } }),
  ]);
  if (byIp >= MAX_PER_IP_HOUR) throw new AppError(429, "Too many sign-in attempts from this network. Please try again later.");
  if (total >= globalPerHour()) {
    console.error(`[otp] global hourly limit (${globalPerHour()}) reached; possible SMS-pumping attack`);
    throw new AppError(503, "Sign-in is temporarily busy. Please try again in a few minutes.");
  }
  const recent = await prisma.otpCode.findMany({ where: { phone, createdAt: { gt: hourAgo } }, orderBy: { createdAt: "desc" } });
  if (recent.length >= MAX_PER_HOUR) throw new AppError(429, "Too many OTP requests. Try again in an hour.");
  if (recent[0] && Date.now() - recent[0].createdAt.getTime() < RESEND_SECONDS * 1000)
    throw new AppError(429, `Please wait ${RESEND_SECONDS} seconds before requesting another OTP.`);

  const code = String(randomInt(100000, 1000000));
  await prisma.otpCode.create({ data: { phone, ip, codeHash: hash(phone, code), expiresAt: new Date(Date.now() + TTL_MIN * 60_000) } });

  const sent = await sendSms(phone, "OTP", [code]); // DLT template text says "valid for 5 minutes" (TTL_MIN)
  if (sent) return {};
  // No SMS provider: print to the server terminal (only the person running the server sees it).
  console.info(`[otp] ${phone} → ${code}`);
  // Fixed demo code while Turfly is being built (DEMO_OTP): shown on screen, accepted alongside the random one.
  const demo = demoOtp();
  if (demo && (await demoAllowedFor(phone))) return { devCode: demo };
  // In demo mode, show the code on screen — but NEVER for privileged accounts, so a public visitor
  // can't sign in as the admin or as a real turf owner just by typing their number.
  const echo = process.env.OTP_DEV_ECHO === "true" && isDemoMode() && !(await isPrivileged(phone));
  return echo ? { devCode: code } : { serverLog: true };
}

/**
 * Fixed sign-in code for the demo phase (DEMO_OTP in .env, e.g. "12345678"), the same on the website and in the app.
 * Active only while demo mode is on and OTP SMS isn't set up (MSG91_AUTH_KEY + MSG91_OTP_TEMPLATE_ID), so it switches
 * itself off at launch. A code must still be requested first, so the per-number and per-network limits apply.
 * Anyone who knows a phone number can sign in as that person with it, so admin numbers are left out unless
 * DEMO_OTP_ADMINS="true".
 */
export function demoOtp(): string | null {
  const c = process.env.DEMO_OTP?.trim();
  if (!c || !/^\d{4,8}$/.test(c) || !isDemoMode()) return null;
  if (process.env.MSG91_AUTH_KEY && process.env.MSG91_OTP_TEMPLATE_ID) return null;
  return c;
}

async function demoAllowedFor(phone: string) {
  if (process.env.DEMO_OTP_ADMINS === "true") return true;
  if (adminPhones().includes(phone)) return false;
  const u = await prisma.user.findUnique({ where: { phone }, select: { role: true } });
  return u?.role !== "ADMIN";
}

/** Admins, ADMIN_PHONES, and owners of real (non-demo) turfs. */
async function isPrivileged(phone: string) {
  if (adminPhones().includes(phone)) return true;
  const u = await prisma.user.findUnique({ where: { phone }, select: { role: true, ownedTurfs: { where: { isDemo: false }, select: { id: true }, take: 1 } } });
  return Boolean(u && (u.role === "ADMIN" || u.ownedTurfs.length > 0));
}

export async function verifyOtp(rawPhone: string, code: string): Promise<string | null> {
  const phone = normalizePhone(rawPhone);
  const demo = demoOtp();
  const usesDemo = Boolean(demo && code === demo);
  if (!phone || !(/^\d{6}$/.test(code) || usesDemo)) return null;
  const otp = await prisma.otpCode.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.attempts >= MAX_ATTEMPTS) return null;
  const ok = usesDemo ? await demoAllowedFor(phone) : timingSafeEqual(Buffer.from(otp.codeHash), Buffer.from(hash(phone, code)));
  if (!ok) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    return null;
  }
  // consume atomically (prevents replay in parallel requests)
  const { count } = await prisma.otpCode.updateMany({ where: { id: otp.id, consumedAt: null }, data: { consumedAt: new Date() } });
  return count === 1 ? phone : null;
}
