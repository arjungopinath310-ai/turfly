import { afterEach, describe, expect, it } from "vitest";
import { demoOtp } from "@/lib/otp";

const KEYS = ["DEMO_OTP", "DEMO_MODE", "MSG91_AUTH_KEY", "MSG91_OTP_TEMPLATE_ID", "NODE_ENV"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const env = process.env as Record<string, string | undefined>;
afterEach(() => {
  for (const k of KEYS) (saved[k] === undefined ? delete env[k] : (env[k] = saved[k]));
});

describe("fixed demo sign-in code", () => {
  it("is used while demo mode is on and OTP SMS isn't set up", () => {
    Object.assign(env, { NODE_ENV: "production", DEMO_MODE: "true", DEMO_OTP: "12345678" });
    delete env.MSG91_AUTH_KEY;
    expect(demoOtp()).toBe("12345678");
  });

  it("switches itself off at launch: demo mode off, or OTP SMS configured", () => {
    Object.assign(env, { NODE_ENV: "production", DEMO_MODE: "false", DEMO_OTP: "12345678" });
    expect(demoOtp()).toBeNull();
    Object.assign(env, { DEMO_MODE: "true", MSG91_AUTH_KEY: "k", MSG91_OTP_TEMPLATE_ID: "t" });
    expect(demoOtp()).toBeNull();
  });

  it("ignores an empty or malformed value", () => {
    Object.assign(env, { NODE_ENV: "production", DEMO_MODE: "true" });
    delete env.MSG91_AUTH_KEY;
    for (const v of ["", "abc", "123", "123456789"]) {
      env.DEMO_OTP = v;
      expect(demoOtp(), v).toBeNull();
    }
  });
});
