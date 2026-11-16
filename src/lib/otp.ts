import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";
import { AppError } from "./errors";
import { sendSms } from "./notifications/providers";

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

export async function requestOtp(rawPhone: string): Promise<{ devCode?: string }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new AppError(400, "Enter a valid 10-digit Indian mobile number");
  const hourAgo = new Date(Date.now() - 3_600_000);
  const recent = await prisma.otpCode.findMany({ where: { phone, createdAt: { gt: hourAgo } }, orderBy: { createdAt: "desc" } });
  if (recent.length >= MAX_PER_HOUR) throw new AppError(429, "Too many OTP requests. Try again in an hour.");
  if (recent[0] && Date.now() - recent[0].createdAt.getTime() < RESEND_SECONDS * 1000)
    throw new AppError(429, `Please wait ${RESEND_SECONDS} seconds before requesting another OTP.`);

  const code = String(randomInt(100000, 1000000));
  await prisma.otpCode.create({ data: { phone, codeHash: hash(phone, code), expiresAt: new Date(Date.now() + TTL_MIN * 60_000) } });

  const sent = await sendSms(phone, `${code} is your Turfly login OTP. Valid for ${TTL_MIN} minutes. Do not share it.`, { otp: code });
  const echo = process.env.OTP_DEV_ECHO === "true" && process.env.NODE_ENV !== "production";
  if (!sent) console.info(`[otp] ${phone} → ${code}`);
  return echo ? { devCode: code } : {};
}

export async function verifyOtp(rawPhone: string, code: string): Promise<string | null> {
  const phone = normalizePhone(rawPhone);
  if (!phone || !/^\d{6}$/.test(code)) return null;
  const otp = await prisma.otpCode.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.attempts >= MAX_ATTEMPTS) return null;
  const ok = timingSafeEqual(Buffer.from(otp.codeHash), Buffer.from(hash(phone, code)));
  if (!ok) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    return null;
  }
  // consume atomically (prevents replay in parallel requests)
  const { count } = await prisma.otpCode.updateMany({ where: { id: otp.id, consumedAt: null }, data: { consumedAt: new Date() } });
  return count === 1 ? phone : null;
}
