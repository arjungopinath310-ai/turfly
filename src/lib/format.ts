/** "+919876543210" → "+91 98765 43210" */
export function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}

/** Best human label for a user: name, else formatted phone, else email. */
export function displayName(u: { name?: string | null; phone?: string | null; email?: string | null }): string {
  return u.name?.trim() || formatPhone(u.phone) || u.email || "Me";
}

/** Demo mode = public demo without SMS/Razorpay: OTP shown on screen (non-privileged users) and simulated payments. */
export const isDemoMode = () => process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "true";

export const adminPhones = () =>
  (process.env.ADMIN_PHONES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** "1 booking", "3 bookings", "1 match", "2 matches" */
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
