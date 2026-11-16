"use client";
import { useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";

export function LoginForm({ next, google }: { next: string; google: boolean }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [serverLog, setServerLog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/auth/otp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error);
    setDevCode(j.devCode ?? null);
    setServerLog(Boolean(j.serverLog));
    setStep("code");
  }

  async function verify() {
    setBusy(true);
    setErr(null);
    const r = await signIn("otp", { phone, code, redirect: false });
    setBusy(false);
    if (r?.error) return setErr("Incorrect or expired OTP");
    // First sign-in: ask for a name so teammates and turf owners see a person, not a number.
    const s = await getSession();
    window.location.href = s?.user?.name ? next : `/profile?welcome=1&next=${encodeURIComponent(next)}`;
  }

  return (
    <div className="mt-6 space-y-4">
      {step === "phone" ? (
        <>
          <div>
            <label className="label">Mobile number</label>
            <div className="flex">
              <span className="grid place-items-center rounded-l-xl border border-r-0 border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">+91</span>
              <input className="input rounded-l-none" inputMode="numeric" autoComplete="tel-national" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} placeholder="98XXXXXXXX" />
            </div>
          </div>
          <button className="btn-primary w-full" disabled={busy || phone.length !== 10} onClick={send}>
            {busy && <Loader2 size={16} className="animate-spin" />} Send OTP
          </button>
        </>
      ) : (
        <>
          <div>
            <label className="label">Enter OTP sent to +91 {phone}</label>
            <input className="input text-center text-2xl tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
            {devCode && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Demo mode: your OTP is <b>{devCode}</b> (SMS sending isn&apos;t set up yet).</p>}
            {!devCode && serverLog && <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">For admin and turf-owner accounts the code is not shown here. It is printed in the server terminal of the person running Turfly.</p>}
          </div>
          <button className="btn-primary w-full" disabled={busy || code.length !== 6} onClick={verify}>
            {busy && <Loader2 size={16} className="animate-spin" />} Verify & continue
          </button>
          <button className="w-full text-sm text-slate-500 hover:underline" onClick={() => { setStep("phone"); setCode(""); }}>Change number / resend</button>
        </>
      )}
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {google && (
        <>
          <div className="flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" /></div>
          <button className="btn-ghost w-full" onClick={() => signIn("google", { callbackUrl: next })}>Continue with Google</button>
        </>
      )}
      <p className="text-center text-xs text-slate-400">By continuing you agree to the terms and privacy policy.</p>
    </div>
  );
}
