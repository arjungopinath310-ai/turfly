import Link from "next/link";
import { CalendarCheck, MapPin, ShieldCheck, Users, Wallet, Zap } from "lucide-react";
import { prisma } from "@/lib/db";
import { searchTurfs } from "@/lib/search";
import { TurfCardView } from "@/components/TurfCard";
import { addDays, todayIst } from "@/lib/time";

export default async function Home() {
  const [cities, turfs] = await Promise.all([
    prisma.city.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    searchTurfs({}).then((r) => r.slice(0, 6)),
  ]);
  return (
    <>
      <section className="relative overflow-hidden bg-pitch-night text-white">
        <div className="absolute inset-0 opacity-30 [background:radial-gradient(60%_60%_at_70%_20%,#12b76a_0%,transparent_60%),repeating-linear-gradient(90deg,transparent_0_78px,rgba(255,255,255,.05)_78px_80px)]" />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:pt-24">
          <span className="chip border-white/15 bg-white/5 text-brand-200">Now live in Manjeri, Kerala</span>
          <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Book your next match <span className="bg-gradient-to-r from-brand-300 to-lime-300 bg-clip-text text-transparent">in under a minute</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-300">
            Compare turfs, see real availability, reserve with a ₹49 advance and bring your whole team, all in one place.
          </p>
          <form action="/turfs" className="mt-8 grid grid-cols-1 max-w-3xl gap-2 rounded-2xl bg-white p-2 text-slate-900 shadow-2xl sm:grid-cols-[1.4fr_1fr_1fr_auto]">
            <input name="q" className="input border-0 focus:ring-0" placeholder="Turf name, area or PIN code" />
            <select name="city" className="input border-0 focus:ring-0" defaultValue="manjeri">
              {cities.map((c) => (
                <option key={c.id} value={c.slug}>{c.name}</option>
              ))}
            </select>
            <select name="format" className="input border-0 focus:ring-0" defaultValue="">
              <option value="">Any format</option>
              <option value="5">5-a-side</option>
              <option value="7">7-a-side</option>
            </select>
            <button className="btn-primary px-6">Search</button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-300">
            <Link href={`/turfs?date=${todayIst()}&time=19:00`} className="chip border-white/15 hover:bg-white/10">Tonight 7 PM</Link>
            <Link href={`/turfs?date=${addDays(todayIst(), 1)}&time=18:00`} className="chip border-white/15 hover:bg-white/10">Tomorrow 6 PM</Link>
            <Link href="/turfs?format=5" className="chip border-white/15 hover:bg-white/10">5-a-side</Link>
            <Link href="/turfs?amenities=floodlights,parking" className="chip border-white/15 hover:bg-white/10">Floodlit + parking</Link>
          </div>
        </div>
      </section>

      {/* relative z-10: these cards overlap the hero's bottom edge and must paint above it */}
      <section className="relative z-10 mx-auto -mt-8 grid grid-cols-1 max-w-6xl gap-3 px-4 sm:grid-cols-3">
        {[
          { icon: <Zap size={18} />, t: "Live slot grid", d: "Green means free right now. No calling around." },
          { icon: <Wallet size={18} />, t: "₹49 to reserve", d: "Pay the rest at the turf. Refund rules shown upfront." },
          { icon: <Users size={18} />, t: "Teams built in", d: "Invite your squad on WhatsApp, track who's in." },
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
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Turfs near you</h2>
            <p className="muted">Manjeri and surroundings</p>
          </div>
          <Link href="/turfs" className="text-sm font-semibold text-brand-700 hover:underline">See all & map →</Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {turfs.map((t) => (
            <TurfCardView key={t.id} t={t} />
          ))}
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-6xl px-4">
        <div className="card grid grid-cols-1 gap-6 overflow-hidden p-8 sm:grid-cols-[1.2fr_1fr] sm:items-center">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Own a turf? Fill your empty hours.</h2>
            <p className="muted mt-2">
              Manage bookings, walk-ins, peak pricing and split pitches (7-a-side ↔ two 5-a-side) from one calendar.
              Unclaimed listing of your turf already here? Claim it in minutes.
            </p>
            <div className="mt-5 flex gap-2">
              <Link href="/owner/turfs/new" className="btn-dark">List your turf</Link>
              <Link href="/owner" className="btn-ghost">Owner dashboard</Link>
            </div>
          </div>
          <ul className="grid gap-3 text-sm">
            <li className="flex gap-2"><CalendarCheck className="text-brand-600" size={18} /> Double-booking impossible, enforced by the database</li>
            <li className="flex gap-2"><ShieldCheck className="text-brand-600" size={18} /> Payments confirmed only by verified gateway webhooks</li>
            <li className="flex gap-2"><MapPin className="text-brand-600" size={18} /> Verified listing badge and Google Maps directions</li>
          </ul>
        </div>
      </section>
    </>
  );
}
