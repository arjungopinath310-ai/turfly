import { describe, expect, it } from "vitest";
import { homeFor, isAppUserAgent, isPublicPath, resolveView, safeNext } from "@/lib/access";

describe("sign-in gate", () => {
  it("lets anyone find and compare turfs, and open the sign-in, about, legal, contact and deletion pages", () => {
    for (const p of ["/", "/turfs", "/turfs/", "/turfs/demo-arena", "/compare", "/games", "/welcome", "/login", "/signup", "/about", "/about/", "/legal/terms", "/legal/privacy", "/legal/refunds", "/contact", "/account/delete", "/contact/"]) expect(isPublicPath(p), p).toBe(true);
  });

  it("requires sign-in to book, join games, chat and run a turf", () => {
    for (const p of ["/bookings", "/checkout/abc", "/games/abc", "/leaderboard", "/split/abc", "/owner", "/owner/calendar", "/admin", "/messages", "/profile", "/teams", "/loginx", "/legal", "/contacts", "/account", "/turfsx"])
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

  it("picks the player or owner side: the sign-in choice wins, otherwise turf owners get the owner side", () => {
    expect(resolveView("PLAYER", "owner")).toBe("owner");
    expect(resolveView("OWNER", "player")).toBe("player");
    expect(resolveView("OWNER", undefined)).toBe("owner");
    expect(resolveView("PLAYER", null)).toBe("player");
    expect(resolveView("ADMIN", undefined)).toBe("player");
    expect(resolveView("OWNER", "something-else")).toBe("owner");
    expect(homeFor("owner")).toBe("/owner");
    expect(homeFor("player")).toBe("/");
  });

  it("recognises the Turfly app's web view", () => {
    expect(isAppUserAgent("Mozilla/5.0 (Linux; Android 15) Chrome/131 Mobile TurflyApp/1.0.0 push=1")).toBe(true);
    expect(isAppUserAgent("Mozilla/5.0 (Linux; Android 15) Chrome/131 Mobile")).toBe(false);
    expect(isAppUserAgent(null)).toBe(false);
  });
});
