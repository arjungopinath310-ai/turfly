import { describe, expect, it } from "vitest";
import { isAppUserAgent, isPublicPath, safeNext } from "@/lib/access";

describe("sign-in gate", () => {
  it("keeps the sign-in, about, legal, contact and deletion pages public", () => {
    for (const p of ["/login", "/about", "/about/", "/legal/terms", "/legal/privacy", "/legal/refunds", "/contact", "/account/delete", "/contact/"]) expect(isPublicPath(p), p).toBe(true);
  });

  it("requires sign-in everywhere else", () => {
    for (const p of ["/", "/turfs", "/turfs/demo-arena", "/bookings", "/split/abc", "/owner", "/admin", "/messages", "/loginx", "/legal", "/contacts", "/account"])
      expect(isPublicPath(p), p).toBe(false);
  });

  it("only redirects back to same-site paths after sign-in", () => {
    expect(safeNext("/turfs?date=2026-11-20")).toBe("/turfs?date=2026-11-20");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("javascript:alert(1)", "")).toBe("");
  });

  it("recognises the Turfly app's web view", () => {
    expect(isAppUserAgent("Mozilla/5.0 (Linux; Android 15) Chrome/131 Mobile TurflyApp/1.0.0 push=1")).toBe(true);
    expect(isAppUserAgent("Mozilla/5.0 (Linux; Android 15) Chrome/131 Mobile")).toBe(false);
    expect(isAppUserAgent(null)).toBe(false);
  });
});
