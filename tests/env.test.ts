import { describe, expect, it } from "vitest";
import { checkEnv } from "@/lib/env";

const good = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://x",
  NEXTAUTH_SECRET: "a".repeat(44),
  NEXTAUTH_URL: "https://turfly.in",
  CRON_SECRET: "c".repeat(32),
  BUSINESS_NAME: "Turfly Sports LLP",
  BUSINESS_ADDRESS: "Manjeri",
  SUPPORT_EMAIL: "help@turfly.in",
  MSG91_AUTH_KEY: "k",
  RAZORPAY_KEY_ID: "rzp_live_x",
  RAZORPAY_KEY_SECRET: "s",
  RAZORPAY_WEBHOOK_SECRET: "w",
} as unknown as NodeJS.ProcessEnv;

describe("startup environment checks", () => {
  it("accepts a complete production configuration", () => {
    expect(checkEnv(good)).toEqual({ errors: [], warnings: [] });
  });
  it("blocks weak or missing secrets in production", () => {
    const r = checkEnv({ ...good, NEXTAUTH_SECRET: "replace-with-openssl", CRON_SECRET: "replace-me" });
    expect(r.errors.join(" ")).toMatch(/NEXTAUTH_SECRET/);
    expect(r.errors.join(" ")).toMatch(/CRON_SECRET/);
  });
  it("only warns about weak secrets in development", () => {
    const r = checkEnv({ ...good, NODE_ENV: "development", CRON_SECRET: "replace-me" } as NodeJS.ProcessEnv);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/CRON_SECRET/);
  });
  it("rejects half-configured Razorpay and flags test keys and demo mode", () => {
    expect(checkEnv({ ...good, RAZORPAY_WEBHOOK_SECRET: "" }).errors.join(" ")).toMatch(/half-configured/);
    expect(checkEnv({ ...good, RAZORPAY_KEY_ID: "rzp_test_x" }).warnings.join(" ")).toMatch(/TEST keys/);
    expect(checkEnv({ ...good, DEMO_MODE: "true" }).warnings.join(" ")).toMatch(/DEMO_MODE/);
  });
  it("validates the Firebase service account", () => {
    expect(checkEnv({ ...good, FCM_SERVICE_ACCOUNT_JSON: "not-base64-json" }).errors.join(" ")).toMatch(/FCM_SERVICE_ACCOUNT_JSON/);
    const sa = Buffer.from(JSON.stringify({ project_id: "p", client_email: "e@p.iam.gserviceaccount.com", private_key: "k" })).toString("base64");
    expect(checkEnv({ ...good, FCM_SERVICE_ACCOUNT_JSON: sa }).errors).toEqual([]);
  });
});
