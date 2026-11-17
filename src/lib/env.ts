/**
 * Environment checks run once at server start (see src/instrumentation.ts).
 * Errors stop a production server from starting; warnings are logged loudly.
 */
export interface EnvReport {
  errors: string[];
  warnings: string[];
}

export function checkEnv(env: NodeJS.ProcessEnv = process.env): EnvReport {
  const set = (k: string) => Boolean(env[k]?.trim());
  const errors: string[] = [];
  const warnings: string[] = [];
  const prod = env.NODE_ENV === "production";

  if (!env.DATABASE_URL) errors.push("DATABASE_URL is not set");
  const secret = env.NEXTAUTH_SECRET ?? "";
  if (!secret) errors.push("NEXTAUTH_SECRET is not set");
  else if (secret.length < 32 || secret.includes("replace")) (prod ? errors : warnings).push("NEXTAUTH_SECRET must be a random value of at least 32 characters (openssl rand -base64 32)");

  if (!env.NEXTAUTH_URL) (prod ? errors : warnings).push("NEXTAUTH_URL is not set");
  else if (prod && !env.NEXTAUTH_URL.startsWith("https://")) warnings.push("NEXTAUTH_URL should be https:// in production (secure cookies)");
  if (env.APP_URL && env.NEXTAUTH_URL && env.APP_URL !== env.NEXTAUTH_URL) warnings.push("APP_URL and NEXTAUTH_URL differ; links in messages will use APP_URL");

  const cron = env.CRON_SECRET ?? "";
  if (!cron || cron === "replace-me" || cron.length < 16) (prod ? errors : warnings).push("CRON_SECRET must be a random value of at least 16 characters");

  const rzp = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"];
  const rzpSet = rzp.filter(set);
  if (rzpSet.length && rzpSet.length < rzp.length) errors.push(`Razorpay is half-configured: set all of ${rzp.join(", ")}`);
  if (prod && rzpSet.length === rzp.length && env.RAZORPAY_KEY_ID?.startsWith("rzp_test_")) warnings.push("Razorpay TEST keys are in use: no real money will be collected");

  if (set("MSG91_AUTH_KEY")) {
    const missing = ["MSG91_OTP_TEMPLATE_ID", "MSG91_TPL_BOOKING_CONFIRMED", "MSG91_TPL_REMINDER", "MSG91_TPL_BALANCE_PENDING"].filter((k) => !set(k));
    if (missing.length) warnings.push(`MSG91 is set but these SMS template IDs are missing, so those messages are not sent: ${missing.join(", ")} (see docs/sms-templates.txt)`);
  }

  if (prod) {
    if (env.DEMO_MODE === "true") warnings.push("DEMO_MODE is on: OTPs are shown on screen and payments are simulated. Turn it off before real launch.");
    if (set("DEMO_OTP") && env.DEMO_MODE === "true" && !(set("MSG91_AUTH_KEY") && set("MSG91_OTP_TEMPLATE_ID")))
      warnings.push(`DEMO_OTP is on: anyone can sign in to player and turf-owner accounts with code ${env.DEMO_OTP}${env.DEMO_OTP_ADMINS === "true" ? " (admins too)" : " (not admins)"}. Remove it before real launch.`);
    if (!rzpSet.length && env.DEMO_MODE !== "true" && env.ALLOW_MOCK_PAYMENTS !== "true") warnings.push("No payment gateway configured: online booking will be unavailable");
    if (!set("MSG91_AUTH_KEY") && env.DEMO_MODE !== "true") warnings.push("No SMS provider (MSG91): players will not receive OTPs");
    for (const k of ["BUSINESS_NAME", "SUPPORT_EMAIL", "BUSINESS_ADDRESS"])
      if (!set(k)) warnings.push(`${k} is not set: legal pages (terms, privacy, refunds) show placeholders`);
  }
  if (set("FCM_SERVICE_ACCOUNT_JSON")) {
    try {
      const sa = JSON.parse(Buffer.from(env.FCM_SERVICE_ACCOUNT_JSON!, "base64").toString("utf8"));
      if (!sa.client_email || !sa.private_key || !sa.project_id) throw new Error("missing fields");
    } catch {
      errors.push("FCM_SERVICE_ACCOUNT_JSON must be the base64 of a Firebase service-account JSON file");
    }
  }
  return { errors, warnings };
}
