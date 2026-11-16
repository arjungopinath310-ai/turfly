/**
 * Writes the SMS templates to register on DLT and MSG91, from the same definitions the app uses
 * (src/lib/notifications/sms.ts), so the registered text and the sent text can never drift apart.
 *   npx tsx scripts/make-sms-docs.ts      → docs/sms-templates.txt + docs/guide/sms-templates.html
 *   powershell -ExecutionPolicy Bypass -File scripts\make-sms-pdf.ps1   (also prints the PDF)
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { msg91Text, renderSms, SMS_TEMPLATES, type SmsTemplate } from "../src/lib/notifications/sms";

const root = path.resolve(__dirname, "..");
const HEADER = "TURFLY";
const purpose: Record<string, string> = {
  OTP: "Sign-in code (sent when someone signs in with their mobile number)",
  BOOKING_CONFIRMED: "Booking confirmed (sent when the online advance is received)",
  REMINDER: "Match reminder (sent 24 hours and 2 hours before the match)",
  BALANCE_PENDING: "Balance due (sent 3 hours before the match if money is still owed at the turf)",
};
const where = (t: SmsTemplate) => (t.key === "OTP" ? "MSG91 > OTP > Templates" : "MSG91 > SMS > Templates (Flow)");

// ---------------- plain text (for copy and paste) ----------------
const txt: string[] = [
  "TURFLY SMS TEMPLATES FOR DLT REGISTRATION (India)",
  "Generated from src/lib/notifications/sms.ts. Copy each template text EXACTLY: same words, spaces and punctuation, one line.",
  "",
  `Sender ID (header): ${HEADER}`,
  "Template type for all four: Service Implicit",
  "Variables: {#var#} on the DLT portal (max 30 characters each). In MSG91 the same text uses ##OTP## or ##var1##, ##var2##, ...",
  "",
];
SMS_TEMPLATES.forEach((t, i) => {
  txt.push(
    `${i + 1}) ${t.name}`,
    `   Purpose: ${purpose[t.key]}`,
    "   DLT template text:",
    `   ${t.text}`,
    `   Variables: ${t.vars.map((v, j) => `${j + 1} = ${v}`).join("; ")}`,
    `   Example SMS: ${renderSms(t.key, t.example)}`,
    `   MSG91 template text (${where(t)}):`,
    `   ${msg91Text(t)}`,
    `   Put MSG91's template ID in .env as: ${t.env}`,
    "",
  );
});
writeFileSync(path.join(root, "docs", "sms-templates.txt"), txt.join("\r\n"));

// ---------------- HTML (printed to PDF) ----------------
const E = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cards = SMS_TEMPLATES.map(
  (t, i) => `
<div class="tpl">
  <h3>${i + 1} · ${E(t.name)}</h3>
  <p class="muted">${E(purpose[t.key])}</p>
  <div class="lbl">DLT template text (copy exactly)</div>
  <pre>${E(t.text)}</pre>
  <table><tr><th>Variable</th><th>Meaning</th><th>Example</th></tr>
  ${t.vars.map((v, j) => `<tr><td>${j + 1}</td><td>${E(v)}</td><td><code>${E(t.example[j])}</code></td></tr>`).join("")}</table>
  <div class="lbl">Example SMS (${renderSms(t.key, t.example).length} characters, 1 SMS)</div>
  <p class="ex">${E(renderSms(t.key, t.example))}</p>
  <div class="lbl">MSG91 template text (${E(where(t))})</div>
  <pre>${E(msg91Text(t))}</pre>
  <p>MSG91 template ID goes in <code>.env</code> as <code>${t.env}</code></p>
</div>`,
).join("\n");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Turfly SMS templates</title>
<style>
@page { size: A4; margin: 14mm 14mm 16mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: "Segoe UI", system-ui, sans-serif; color: #0f172a; font-size: 10pt; line-height: 1.5; margin: 0; }
h1 { font-size: 21pt; margin: 0 0 2mm; } h2 { font-size: 14pt; margin: 6mm 0 2.5mm; padding-bottom: 1.5mm; border-bottom: 2px solid #12b76a; }
h3 { font-size: 11.5pt; margin: 0 0 1mm; color: #027a48; } p { margin: 0 0 2mm; } ol, ul { margin: 0 0 3mm; padding-left: 5.5mm; } li { margin-bottom: 1mm; }
.muted { color: #475569; } .lbl { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #64748b; margin: 2.5mm 0 1mm; }
pre { font-family: Consolas, monospace; font-size: 9.5pt; background: #0f172a; color: #e2e8f0; padding: 2.5mm 3.5mm; border-radius: 2mm; margin: 0; white-space: pre-wrap; }
.ex { background: #ecfdf3; border: 1px solid #a6f4c5; border-radius: 2mm; padding: 2mm 3mm; font-size: 9.5pt; }
code { font-family: Consolas, monospace; font-size: 8.8pt; background: #f1f5f9; padding: .2mm 1mm; border-radius: 1mm; }
table { width: 100%; border-collapse: collapse; margin: 2mm 0; font-size: 9pt; } th { text-align: left; background: #f1f5f9; padding: 1.3mm 2mm; } td { padding: 1.3mm 2mm; border-bottom: 1px solid #e2e8f0; }
.tpl { border: 1px solid #e2e8f0; border-radius: 3mm; padding: 4mm; margin: 0 0 5mm; page-break-inside: avoid; }
.note { border-left: 3px solid #12b76a; background: #ecfdf3; padding: 2.2mm 3.2mm; margin: 3mm 0; }
.warn { border-left: 3px solid #f59e0b; background: #fffbeb; padding: 2.2mm 3.2mm; margin: 3mm 0; }
.page { page-break-before: always; }
</style></head><body>
<h1>Turfly SMS templates</h1>
<p class="muted">For DLT registration (India) and MSG91. Generated from <code>src/lib/notifications/sms.ts</code>, the same text the app sends.
A copy-and-paste version is in <code>docs\\sms-templates.txt</code>.</p>

<h2>What you register</h2>
<table>
<tr><th>Item</th><th>Value</th></tr>
<tr><td>Sender ID (header)</td><td><code>${HEADER}</code> (6 letters). If the portal rejects it, use a 6-letter header that matches your business or brand name and tell your developer.</td></tr>
<tr><td>Template type</td><td><b>Service Implicit</b> for all four (sign-in codes and booking updates for your own users)</td></tr>
<tr><td>Category</td><td>The closest match on your portal, e.g. "Tourism and Leisure" or "Others"</td></tr>
<tr><td>Templates</td><td>${SMS_TEMPLATES.length}: ${SMS_TEMPLATES.map((t) => `<code>${t.name}</code>`).join(", ")}</td></tr>
</table>
<div class="note">Every message is plain English with "Rs." instead of the rupee sign: one special character turns an SMS into a Unicode SMS,
which halves its length and doubles the price. Each message fits in one SMS (160 characters).</div>

<h2>Step 1 · DLT registration (once)</h2>
<ol>
<li>Pick any one telecom DLT portal (a registration works on every network), for example Jio TrueConnect, Airtel DLT, Vi (Vilpower) or BSNL.</li>
<li>Register as a <b>Principal Entity</b> (your business): PAN, GST certificate or Udyam registration (free online), ID of the authorised person and the
letter of authorisation the portal provides. One-time fee of about ₹5,000–6,000; approval usually takes a few working days. Note your <b>Entity ID</b>.</li>
<li>Register the <b>header</b> <code>${HEADER}</code> for service messages.</li>
<li>Add the four <b>content templates</b> below: type Service Implicit, header ${HEADER}, and paste each text exactly. Note each <b>DLT Template ID</b>.</li>
</ol>
<div class="warn">If a reviewer asks you to change the wording, the app's text must change too (it must match word for word):
edit <code>src/lib/notifications/sms.ts</code> (or ask your developer), then regenerate this document.</div>

<h2>Step 2 · MSG91</h2>
<ol>
<li>Create an account at msg91.com and complete their KYC.</li>
<li>Add your DLT <b>Entity ID</b> and the sender ID <code>${HEADER}</code>.</li>
<li><b>Sign-in code:</b> MSG91 → OTP → Templates → new template. Paste the MSG91 text of template 1 (with <code>##OTP##</code>), enter its DLT Template ID and sender ${HEADER}.</li>
<li><b>Other three:</b> MSG91 → SMS → Templates (Flow) → new template for each. Paste the MSG91 text exactly, with the variables written as
<code>##var1##</code>, <code>##var2##</code>… in that order, and enter the matching DLT Template ID.</li>
<li>Copy MSG91's <b>template ID</b> of each into <code>.env</code> (names below), and the <b>Auth key</b> (MSG91 → API) into <code>MSG91_AUTH_KEY</code>.</li>
<li>Buy SMS credits (roughly ₹0.20–0.30 per SMS).</li>
</ol>

<h2>Step 3 · Switch it on</h2>
<ol>
<li>Open <code>.env</code> with Notepad, fill in <code>MSG91_AUTH_KEY</code>, <code>MSG91_OTP_TEMPLATE_ID</code>, <code>MSG91_TPL_BOOKING_CONFIRMED</code>, <code>MSG91_TPL_REMINDER</code>, <code>MSG91_TPL_BALANCE_PENDING</code>.</li>
<li>Restart the website: <code>powershell -ExecutionPolicy Bypass -File scripts\\restart-server.ps1</code>. The Turfly server window warns if a template ID is missing.</li>
<li>Admin → Fees, policy &amp; offers → Reminders: tick <b>sms</b>.</li>
<li>Test: sign in with your own number; the code should arrive by SMS (no longer shown on screen). Make a test booking and check the confirmation SMS.</li>
</ol>
<p class="muted">Cost per booking: up to 4 SMS (confirmation, 24 h and 2 h reminders, balance due), plus 1 per sign-in: about ₹1–1.5 per booking.</p>

<div class="page"></div>
<h2>The four templates</h2>
${cards}
</body></html>`;
writeFileSync(path.join(root, "docs", "guide", "sms-templates.html"), html);
console.log("wrote docs/sms-templates.txt and docs/guide/sms-templates.html");
