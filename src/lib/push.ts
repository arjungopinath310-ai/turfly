import { createSign } from "node:crypto";
import { prisma } from "./db";

/**
 * Push notifications through Firebase Cloud Messaging (HTTP v1 API).
 * Enabled when FCM_SERVICE_ACCOUNT_JSON (base64 of the Firebase service-account JSON) is set; otherwise a no-op.
 * Best-effort: failures are logged and never break the action that triggered the notification.
 */
interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let cachedSa: ServiceAccount | null | undefined;
function serviceAccount(): ServiceAccount | null {
  if (cachedSa !== undefined) return cachedSa;
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  try {
    cachedSa = raw ? (JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as ServiceAccount) : null;
  } catch {
    cachedSa = null;
  }
  return cachedSa;
}

export const pushEnabled = () => Boolean(serviceAccount());

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

let token: { value: string; exp: number } | null = null;
async function accessToken(sa: ServiceAccount): Promise<string> {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(sa.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${signature}` }),
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !j.access_token) throw new Error(`FCM auth failed: ${j.error ?? res.status}`);
  token = { value: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return token.value;
}

export interface PushMessage {
  title: string;
  body: string;
  link?: string | null; // in-app path to open when tapped
  tag?: string; // same tag replaces the previous notification (e.g. one per chat)
}

export async function sendPushToUser(userId: string, msg: PushMessage) {
  const sa = serviceAccount();
  if (!sa) return;
  const devices = await prisma.deviceToken.findMany({ where: { userId }, select: { id: true, token: true } });
  if (!devices.length) return;
  const auth = await accessToken(sa);
  await Promise.all(
    devices.map(async (d) => {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: "POST",
        headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            token: d.token,
            notification: { title: msg.title.slice(0, 100), body: msg.body.slice(0, 240) },
            data: { link: msg.link ?? "/notifications" },
            android: { priority: "HIGH", notification: { channel_id: "turfly_default", tag: msg.tag, color: "#458323", icon: "ic_stat_turfly" } },
          },
        }),
      });
      if (res.ok) return;
      const text = await res.text();
      // token no longer valid (app uninstalled / data cleared) → forget it
      if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT.*registration/i.test(text)) await prisma.deviceToken.delete({ where: { id: d.id } }).catch(() => {});
      else console.warn(`[push] ${res.status} ${text.slice(0, 200)}`);
    }),
  );
}

/** Fire-and-forget wrapper: never throws, never blocks the caller. */
export function queuePush(userId: string, msg: PushMessage) {
  if (!pushEnabled()) return;
  setImmediate(() => sendPushToUser(userId, msg).catch((e) => console.warn("[push]", (e as Error).message)));
}
