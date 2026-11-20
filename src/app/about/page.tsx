import Link from "next/link";
import { CalendarCheck, MapPin, ShieldCheck, Users, Wallet, Zap } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `About · ${BRAND.name}` };

/**
 * Public page describing the service, for visitors who are not signed in and for reviewers
 * (Razorpay's website check, Google sign-in verification, Play Store). It shows no turfs or other
 * app data: everything else needs sign-in (src/lib/access.ts).
 */
export default async function About() {
  const user = await currentUser().catch(() => null);
  const cta = user ? { href: "/turfs", label: "Find turfs" } : { href: "/signup", label: "Sign up free" };
  return (
    <>
      <section className="relative overflow-hidden bg-pitch-night text-white">
        <div className="absolute inset-0 opacity-30 [background:radial-gradient(60%_60%_at_70%_20%,#12b76a_0%,transparent_60%),repeating-linear-gradient(90deg,transparent_0_78px,rgba(255,255,255,.05)_78px_80px)]" />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:pt-24">
          <span className="chip border-white/15 bg-white/5 text-brand-200">Football turfs across India</span>
          <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Book your next match <span className="bg-gradient-to-r from-brand-300 to-lime-300 bg-clip-text text-transparent">in under a minute</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-300">
            {BRAND.name} shows the football turfs near you with their real availability. It&apos;s free to use: book a slot for a ₹49
            booking fee, pay the turf&apos;s price at the turf, and bring your whole team.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={cta.href} className="btn-primary px-6">{cta.label}</Link>
            <Link href="/legal/refunds" className="btn border border-white/20 text-white hover:bg-white/10">Cancellation &amp; refunds</Link>
          </div>
          {!user && <p className="mt-3 text-sm text-slate-400">An account is free. Already have one? <Link href="/login" className="underline">Sign in</Link>.</p>}
        </div>
      </section>

      {/* relative z-10: these cards overlap the hero's bottom edge and must paint above it */}
      <section className="relative z-10 mx-auto -mt-8 grid grid-cols-1 max-w-6xl gap-3 px-4 sm:grid-cols-3">
        {[
          { icon: <Zap size={18} />, t: "Live slot grid", d: "See which hours are free right now. No calling around." },
          { icon: <Wallet size={18} />, t: "₹49 to book", d: "A small booking fee online; the turf's price is paid at the turf. Refund rules shown upfront." },
          { icon: <Users size={18} />, t: "Teams built in", d: "Invite your squad on WhatsApp, track who's in, find extra players." },
        ].map((f) => (
          <div key={f.t} className="card flex gap-3 p-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">{f.icon}</span>
            <div>
              <div className="font-semibold">{f.t}</div>
              <div className="muted">{f.d}</div>
            </div>
          </div>
        ))}
      </section>

      <section className="mx-auto mt-14 max-w-6xl px-4">
        <h2 className="text-2xl font-bold tracking-tight">How it works</h2>
        <ol className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          {[
            ["Sign up free", "With your mobile number (one-time code). Allow location to see the turfs nearest you."],
            ["Pick a turf and hour", "Compare turfs, prices and amenities, and see which hours are free."],
            ["Pay the booking fee", "Pay ₹49 online to book the slot. The booking is confirmed instantly."],
            ["Play", "Pay the turf's price at the turf. Reminders and directions arrive before the match."],
          ].map(([t, d], i) => (
            <li key={t} className="card p-4">
              <div className="text-sm font-bold text-brand-700">Step {i + 1}</div>
              <div className="mt-1 font-semibold">{t}</div>
              <div className="muted">{d}</div>
            </li>
          ))}
        </ol>
      </section>

      {/* For visitors and reviewers; signed-in players don't see owner options. */}
      {!user && (
      <section className="mx-auto mt-16 max-w-6xl px-4">
        <div className="card grid grid-cols-1 gap-6 overflow-hidden p-8 sm:grid-cols-[1.2fr_1fr] sm:items-center">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Own a turf? Fill your empty hours.</h2>
            <p className="muted mt-2">
              Turfly already shows turfs near players all over India. Claim yours free to take online bookings: every booking arrives on WhatsApp, payments go through Razorpay, and walk-ins, peak pricing and split pitches (7-a-side ↔ two 5-a-side) live in one calendar.
            </p>
            <Link href={user ? "/owner" : "/signup?as=owner"} className="btn-dark mt-4">List your turf free</Link>
          </div>
          <ul className="grid gap-3 text-sm">
            <li className="flex gap-2"><CalendarCheck className="text-brand-600" size={18} /> Double-booking impossible, enforced by the database</li>
            <li className="flex gap-2"><ShieldCheck className="text-brand-600" size={18} /> Payments confirmed only by verified gateway webhooks</li>
            <li className="flex gap-2"><MapPin className="text-brand-600" size={18} /> Verified listing badge and Google Maps directions</li>
          </ul>
        </div>
      </section>
      )}
    </>
  );
}
