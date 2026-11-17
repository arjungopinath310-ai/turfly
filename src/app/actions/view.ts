"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { homeFor, VIEW_COOKIE, VIEW_COOKIE_MAX_AGE, type View } from "@/lib/access";
import { requireUser } from "@/lib/auth";

/**
 * Switches between the player and turf-owner side (menu "Switch to …").
 * Only a preference: owner pages still check that the user manages the turf.
 * Not httpOnly, because the sign-in page sets the same cookie in the browser.
 */
export async function switchView(fd: FormData) {
  await requireUser();
  const to: View = fd.get("to") === "owner" ? "owner" : "player";
  (await cookies()).set(VIEW_COOKIE, to, { path: "/", maxAge: VIEW_COOKIE_MAX_AGE, sameSite: "lax", httpOnly: false });
  redirect(homeFor(to));
}
