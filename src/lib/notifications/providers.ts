// Channel adapters. Each returns true if actually delivered via a configured provider,
// false if not configured (message is logged instead). Swap providers here without touching callers.

import { renderSms, smsTemplate, type SmsKey } from "./sms";

/**
 * SMS via MSG91. In India every SMS must use a DLT-registered template (see sms.ts):
 * the OTP goes through MSG91's OTP API, every other message through its Flow API with ##var1##… values.
 * Returns false (and logs the text) when MSG91 or that template's ID is not configured yet.
 */
export async function sendSms(phone: string, key: SmsKey, vars: string[]): Promise<boolean> {
  const auth = process.env.MSG91_AUTH_KEY;
  const t = smsTemplate(key);
  const templateId = process.env[t.env];
  const text = renderSms(key, vars);
  if (!auth || !templateId) {
    console.info(`[sms:${auth ? `no-template ${t.env}` : "not-configured"}] ${phone}: ${text}`);
    return false;
  }
  const mobile = phone.replace("+", "");
  const [url, body] =
    key === "OTP"
      ? ["https://control.msg91.com/api/v5/otp", { template_id: templateId, mobile, otp: vars[0] }]
      : ["https://control.msg91.com/api/v5/flow", { template_id: templateId, short_url: "0", recipients: [{ mobiles: mobile, ...Object.fromEntries(vars.map((v, i) => [`var${i + 1}`, v])) }] }];
  const res = await fetch(url, { method: "POST", headers: { authkey: auth, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`MSG91 ${res.status}: ${await res.text()}`);
  return true;
}

export async function sendWhatsApp(phone: string, template: string, params: string[]): Promise<boolean> {
  const tokenV = process.env.WHATSAPP_TOKEN;
  const pid = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!tokenV || !pid) {
    console.info(`[whatsapp:not-configured] ${phone} ${template}: ${params.join(" | ")}`);
    return false;
  }
  const res = await fetch(`https://graph.facebook.com/v20.0/${pid}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${tokenV}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone.replace("+", ""),
      type: "template",
      template: {
        name: template.toLowerCase(),
        language: { code: "en" },
        components: [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p })) }],
      },
    }),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${await res.text()}`);
  return true;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[email:not-configured] ${to}: ${subject}`);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return true;
}
