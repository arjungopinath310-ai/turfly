"use client";
import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Check, Loader2 } from "lucide-react";
import { homeFor, VIEW_COOKIE, VIEW_COOKIE_MAX_AGE, type View } from "@/lib/access";

const CHOICES: { view: View; icon: string; title: string; hint: string }[] = [
  { view: "player", icon: "⚽", title: "I want to play", hint: "Find and book turfs near you" },
  { view: "owner", icon: "🏟️", title: "I own or run a turf", hint: "List it free, manage bookings" },
];

function rememberView(view: View) {
  document.cookie = `${VIEW_COOKIE}=${view}; Path=/; Max-Age=${VIEW_COOKIE_MAX_AGE}; SameSite=Lax`;
}

type Step = "details" | "code" | "finish";

/** New account: who you are and how you'll use Turfly, then the code sent to your phone. */
export function SignupForm({ next, initialView, fee }: { next: string; initialView: View; fee: string }) {
  const [view, setView] = useState<View>(initialView);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [terms, setTerms] = useState(false);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>("details");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [serverLog, setServerLog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const destination = next || homeFor(view);
  const detailsOk = name.trim().length >= 2 && phone.length === 10 && terms && (!email || /^\S+@\S+\.\S+$/.test(email));

  async function sendCode() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/otp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone }) });
      const j = await r.json();
      if (!r.ok) return setErr(j.error ?? "Couldn't send the code. Try again.");
      setDevCode(j.devCode ?? null);
      setServerLog(Boolean(j.serverLog));
      setStep("code");
    } catch {
      setErr("No connection. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    const r = await fetch("/api/account/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim(), email: email.trim(), acceptTerms: true }) });
    if (r.ok) {
      window.location.href = destination;
      return true;
    }
    const j = await r.json().catch(() => ({}));
    setErr(j.error ?? "Couldn't save your details. Try again.");
    setStep("finish");
    return false;
  }

  async function verify() {
    setBusy(true);
    setErr(null);
    rememberView(view);
    try {
      const r = await signIn("otp", { phone, code, redirect: false });
      if (r?.error) return setErr("Incorrect or expired code");
      await finish();
    } catch {
      setErr("No connection. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function retryFinish() {
    setBusy(true);
    setErr(null);
    try {
      await finish();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-400" aria-label={`Step ${step === "details" ? 1 : 2} of 2`}>
          <span className={`h-1.5 w-8 rounded-full ${step === "details" ? "bg-brand-600" : "bg-brand-200"}`} />
          <span className={`h-1.5 w-8 rounded-full ${step === "details" ? "bg-slate-200" : "bg-brand-600"}`} />
          <span className="ml-1">Step {step === "details" ? 1 : 2} of 2</span>
        </div>
        <h1 className="h1">{step === "details" ? "Create your account" : step === "code" ? "Verify your number" : "Almost done"}</h1>
        <p className="muted mt-1">{step === "details" ? "Free for players and turf owners." : step === "code" ? `Enter the code sent to +91 ${phone}.` : "One detail needs fixing."}</p>
      </div>

      {step === "details" && (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!busy && detailsOk) sendCode(); }}>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="I am signing up as">
            {CHOICES.map((c) => {
              const on = view === c.view;
              return (
                <button key={c.view} type="button" role="radio" aria-checked={on} onClick={() => { setView(c.view); rememberView(c.view); }}
                  className={`relative rounded-2xl border-2 p-3 text-left transition ${on ? "border-brand-600 bg-brand-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  {on && <Check size={16} className="absolute right-2.5 top-2.5 text-brand-700" aria-hidden />}
                  <div className="text-2xl" aria-hidden>{c.icon}</div>
                  <div className="mt-1 text-sm font-bold leading-tight">{c.title}</div>
                  <div className="text-xs text-slate-500">{c.hint}</div>
                </button>
              );
            })}
          </div>
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {view === "owner"
              ? <>Listing your turf and managing bookings is <b>free</b>. Players pay Turfly a {fee} booking fee online; you collect your full price at the turf.</>
              : <>Finding turfs is <b>free</b>. To book a slot you pay a {fee} booking fee online; the turf&apos;s price is paid at the turf.</>}
          </p>

          <div>
            <label className="label" htmlFor="su-name">Full name</label>
            <input id="su-name" className="input" autoComplete="name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
          </div>
          <div>
            <label className="label" htmlFor="su-phone">Mobile number</label>
            <div className="flex">
              <span className="grid place-items-center rounded-l-xl border border-r-0 border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">+91</span>
              <input id="su-phone" className="input rounded-l-none" inputMode="numeric" autoComplete="tel-national" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} placeholder="98XXXXXXXX" required />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="su-email">Email <span className="normal-case tracking-normal text-slate-400">(optional, for receipts)</span></label>
            <input id="su-email" type="email" className="input" autoComplete="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value.trim())} placeholder="you@example.com" />
          </div>
          <label className="flex items-start gap-2.5 text-sm text-slate-600">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
            <span>I agree to the <Link href="/legal/terms" target="_blank" className="font-semibold text-brand-700 underline">Terms</Link>, <Link href="/legal/privacy" target="_blank" className="font-semibold text-brand-700 underline">Privacy policy</Link> and <Link href="/legal/refunds" target="_blank" className="font-semibold text-brand-700 underline">Cancellation policy</Link>.</span>
          </label>
          <button type="submit" className="btn-primary w-full" disabled={busy || !detailsOk}>
            {busy && <Loader2 size={16} className="animate-spin" />} Send code
          </button>
        </form>
      )}

      {step === "code" && (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!busy && code.length >= 6) verify(); }}>
          <input aria-label="Code" className="input text-center text-2xl tracking-[0.3em]" inputMode="numeric" enterKeyHint="done" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
          {devCode && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Demo mode: use code <b>{devCode}</b> (SMS sending isn&apos;t set up yet).</p>}
          {!devCode && serverLog && <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">For admin and turf-owner accounts the code is not shown here. It is printed in the server terminal of the person running Turfly.</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy || code.length < 6}>
            {busy && <Loader2 size={16} className="animate-spin" />} Create account
          </button>
          <button type="button" className="w-full text-sm text-slate-500 hover:underline" onClick={() => { setStep("details"); setCode(""); setErr(null); }}>Change details / resend code</button>
        </form>
      )}

      {step === "finish" && (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!busy) retryFinish(); }}>
          <p className="text-sm text-slate-600">You&apos;re signed in as +91 {phone}.</p>
          <div>
            <label className="label" htmlFor="su-email2">Email <span className="normal-case tracking-normal text-slate-400">(optional)</span></label>
            <input id="su-email2" type="email" className="input" autoComplete="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value.trim())} />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" />} Finish</button>
        </form>
      )}

      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{err}</p>}
    </div>
  );
}
