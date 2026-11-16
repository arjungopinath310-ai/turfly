// Channel adapters. Each returns true if actually delivered via a configured provider,
// false if not configured (message is logged instead). Swap providers here without touching callers.

export async function sendSms(phone: string, text: string, vars: Record<string, string> = {}): Promise<boolean> {
  const key = process.env.MSG91_AUTH_KEY;
  if (!key) {
    console.info(`[sms:not-configured] ${phone}: ${text}`);
    return false;
  }
  // MSG91: OTP API for OTP messages, Flow API for transactional templates (DLT-registered in India).
  const isOtp = Boolean(vars.otp);
  const url = isOtp ? "https://control.msg91.com/api/v5/otp" : "https://control.msg91.com/api/v5/flow";
  const body = isOtp
    ? { template_id: process.env.MSG91_OTP_TEMPLATE_ID, mobile: phone.replace("+", ""), otp: vars.otp }
    : { template_id: process.env.MSG91_FLOW_TEMPLATE_ID, recipients: [{ mobiles: phone.replace("+", ""), ...vars, message: text }] };
  const res = await fetch(url, { method: "POST", headers: { authkey: key, "content-type": "application/json" }, body: JSON.stringify(body) });
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
