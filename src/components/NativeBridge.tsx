"use client";
/**
 * Glue between the website and the Turfly Android app (Capacitor).
 * In a normal browser it only registers the offline service worker. Inside the app it:
 *  - makes the hardware back button go back (and exit on the home screen),
 *  - asks for notification permission once signed in and registers the push token,
 *  - opens the right screen when a notification is tapped.
 * Plugins are reached through window.Capacitor, which the app injects, so the website needs no extra packages.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Listener = { remove: () => void };
interface CapPlugins {
  App?: { addListener: (e: string, cb: (x: { canGoBack: boolean }) => void) => Promise<Listener>; exitApp: () => void; getInfo?: () => Promise<{ version: string }> };
  PushNotifications?: {
    checkPermissions: () => Promise<{ receive: string }>;
    requestPermissions: () => Promise<{ receive: string }>;
    register: () => Promise<void>;
    createChannel?: (c: Record<string, unknown>) => Promise<void>;
    addListener: (e: string, cb: (x: any) => void) => Promise<Listener>; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
}
declare global {
  interface Window {
    Capacitor?: { isNativePlatform: () => boolean; getPlatform: () => string; Plugins: CapPlugins };
  }
}

const TOKEN_KEY = "turfly.pushToken";
export const isApp = () => typeof window !== "undefined" && Boolean(window.Capacitor?.isNativePlatform?.());
const appHasPush = () => typeof navigator !== "undefined" && /TurflyApp\/[^ ]+ push=1/.test(navigator.userAgent);

/** Call before signing out so this phone stops receiving the account's notifications. */
export async function forgetPushToken() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) await fetch("/api/devices", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export function NativeBridge({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();

  // Offline page for the website (not inside the app, where the app shows its own offline screen).
  useEffect(() => {
    if (isApp() || !("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    if (!isApp()) return;
    document.documentElement.classList.add("native-app");
    const P = window.Capacitor!.Plugins;
    const subs: Promise<Listener>[] = [];
    if (P.App)
      subs.push(
        P.App.addListener("backButton", ({ canGoBack }) => {
          // Each side's home ("/" for players, "/owner" for turf owners) and the sign-in page close the app.
          if (canGoBack && !["/", "/owner", "/login"].includes(location.pathname)) history.back();
          else P.App!.exitApp();
        }),
      );
    if (P.PushNotifications && appHasPush()) {
      subs.push(
        P.PushNotifications.addListener("pushNotificationActionPerformed", (a) => {
          const link = a?.notification?.data?.link;
          if (typeof link === "string" && link.startsWith("/")) router.push(link);
        }),
      );
    }
    return () => subs.forEach((s) => s.then((l) => l.remove()));
  }, [router]);

  // Register for push once the user is signed in (Android 13+ shows the permission prompt here).
  useEffect(() => {
    if (!isApp() || !signedIn || !appHasPush()) return;
    const Push = window.Capacitor!.Plugins.PushNotifications;
    if (!Push) return;
    let reg: Promise<Listener> | null = null;
    (async () => {
      try {
        await Push.createChannel?.({ id: "turfly_default", name: "Bookings & messages", importance: 4, visibility: 1 });
        let perm = await Push.checkPermissions();
        if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") perm = await Push.requestPermissions();
        if (perm.receive !== "granted") return;
        reg = Push.addListener("registration", async ({ value }: { value: string }) => {
          localStorage.setItem(TOKEN_KEY, value);
          const appVersion = navigator.userAgent.match(/TurflyApp\/([^ ]+)/)?.[1];
          await fetch("/api/devices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: value, platform: "android", appVersion }) });
        });
        await Push.register();
      } catch (e) {
        console.warn("push registration failed", e);
      }
    })();
    return () => {
      reg?.then((l) => l.remove());
    };
  }, [signedIn]);

  return null;
}
