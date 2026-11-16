import type { CapacitorConfig } from "@capacitor/cli";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Turfly Android app.
 * The app shows the live Turfly website (TURFLY_URL) inside a native shell, so every feature and fix reaches the app
 * immediately, and adds native features on top (push notifications, back button, UPI app hand-off, downloads, offline screen).
 *
 *   TURFLY_URL=https://turfly.in npm run build:debug
 */
const url = (process.env.TURFLY_URL ?? readSavedUrl()).replace(/\/$/, "");
if (!/^https:\/\//.test(url)) throw new Error(`TURFLY_URL must be an https:// address (got "${url}")`);
const host = new URL(url).host;
const version = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8")).version as string;
// Push is only switched on when the Firebase config file is present, otherwise registering would crash the app.
const hasPush = existsSync(join(__dirname, "android", "app", "google-services.json"));

function readSavedUrl() {
  try {
    return readFileSync(join(__dirname, ".turfly-url"), "utf8").trim();
  } catch {
    return "https://turfly.in";
  }
}

const config: CapacitorConfig = {
  appId: "in.turfly.app",
  appName: "Turfly",
  webDir: "www",
  backgroundColor: "#ffffff",
  // Lets the website recognise the app (no service worker inside the app; push only when configured).
  appendUserAgent: `TurflyApp/${version}${hasPush ? " push=1" : ""}`,
  server: {
    url,
    errorPath: "offline.html", // shown when the phone has no connection or the server is unreachable
    androidScheme: "https",
    // Razorpay checkout runs inside the app; any other site (WhatsApp, Google Maps, UPI apps) opens outside it.
    allowNavigation: [host, "api.razorpay.com", "checkout.razorpay.com", "*.razorpay.com"],
  },
  android: {
    allowMixedContent: false,
    captureInput: false,
    webContentsDebuggingEnabled: process.env.TURFLY_WEBVIEW_DEBUG === "true",
  },
  plugins: {
    SystemBars: { insetsHandling: "css", style: "DARK" },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};

export default config;
