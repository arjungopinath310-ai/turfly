"use client";
import { useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { homeFor, VIEW_COOKIE, VIEW_COOKIE_MAX_AGE, type View } from "@/lib/access";

const CHOICES: { view: View; icon: string; title: string; hint: string }[] = [
  { view: "player", icon: "⚽", title: "I want to play", hint: "Find and book turfs" },
  { view: "owner", icon: "🏟️", title: "I own or run a turf", hint: "Manage your bookings" },
];

function rememberView(view: View) {
  document.cookie = `${VIEW_COOKIE}=${view}; Path=/; Max-Age=${VIEW_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function LoginForm({ next, google, initialView }: { next: string; google: boolean; initialView: View }) {
  const [view, setView] = useState<View>(initialView);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [serverLog, setServerLog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // A link that sent someone here (split payment, team invite…) wins; otherwise each side has its own home.
  const destination = next || homeFor(view);

  function choose(v: View) {
    setView(v);
    rememberView(v);
  }

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
    rememberView(view);
    const r = await signIn("otp", { phone, code, redirect: false });
    setBusy(false);
    if (r?.error) return setErr("Incorrect or expired OTP");
    // First sign-in: ask for a name so teammates and turf owners see a person, not a number.
    const s = await getSession();
    window.location.href = s?.user?.name ? destination : `/profile?welcome=1&next=${encodeURIComponent(destination)}`;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="h1">{view === "owner" ? "Sign in to manage your turf" : "Sign in to play"}</h1>
        <p className="muted mt-1">How will you use Turfly?</p>
      </div>

      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="I am signing in as">
        {CHOICES.map((c) => {
          const on = view === c.view;
          return (
            <button
              key={c.view}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={step === "code"}
              onClick={() => choose(c.view)}
              className={`rounded-2xl border-2 p-3 text-left transition ${on ? "border-brand-600 bg-brand-50" : "border-slate-200 bg-white hover:border-slate-300"} disabled:opacity-60`}
            >
              <div className="text-2xl" aria-hidden>{c.icon}</div>
              <div className="mt-1 text-sm font-bold leading-tight">{c.title}</div>
              <div className="text-xs text-slate-500">{c.hint}</div>
            </button>
          );
        })}
      </div>

      {/* Real forms, so Enter (or "Go" on a phone keyboard) moves on, like tapping the button */}
      {step === "phone" ? (
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (!busy && phone.length === 10) send(); }}>
          <div>
            <label className="label" htmlFor="login-phone">Mobile number</label>
            <div className="flex">
              <span className="grid place-items-center rounded-l-xl border border-r-0 border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">+91</span>
              <input id="login-phone" className="input rounded-l-none" inputMode="numeric" enterKeyHint="send" autoComplete="tel-national" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} placeholder="98XXXXXXXX" />
            </div>
            <p className="mt-1 text-xs text-slate-500">We&apos;ll send you a sign-in code.</p>
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy || phone.length !== 10}>
            {busy && <Loader2 size={16} className="animate-spin" />} Send code
          </button>
        </form>
      ) : (
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (!busy && code.length >= 6) verify(); }}>
          <div>
            <label className="label" htmlFor="login-code">Enter the code sent to +91 {phone}</label>
            <input id="login-code" className="input text-center text-2xl tracking-[0.3em]" inputMode="numeric" enterKeyHint="done" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
            {devCode && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Demo mode: use code <b>{devCode}</b> (SMS sending isn&apos;t set up yet).</p>}
            {!devCode && serverLog && <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">For admin and turf-owner accounts the code is not shown here. It is printed in the server terminal of the person running Turfly.</p>}
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy || code.length < 6}>
            {busy && <Loader2 size={16} className="animate-spin" />} Verify & continue
          </button>
          <button type="button" className="w-full text-sm text-slate-500 hover:underline" onClick={() => { setStep("phone"); setCode(""); }}>Change number / resend</button>
        </form>
      )}
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {google && step === "phone" && (
        <>
          <div className="flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" /></div>
          <button className="btn-ghost w-full" onClick={() => { rememberView(view); signIn("google", { callbackUrl: destination }); }}>Continue with Google</button>
        </>
      )}
      <p className="text-center text-xs text-slate-400">By continuing you agree to the terms and privacy policy.</p>
    </div>
  );
}
