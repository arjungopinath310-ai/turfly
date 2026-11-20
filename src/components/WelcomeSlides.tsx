"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { NeighbourhoodMap } from "./NeighbourhoodMap";

export const WELCOMED_COOKIE = "turfly_welcomed";

/** First-time welcome: three swipeable screens, then sign up (or sign in). Shown once per device. */
export function WelcomeSlides({ fee }: { fee: string }) {
  const slides = [
    { variant: "players" as const, title: "Find players around you", text: "Short of players? Join a game nearby, or post yours and fill it in minutes." },
    { variant: "turfs" as const, title: "Every turf near you", text: `Free slots, prices and directions in one place. Book for ${fee} and pay the rest at the turf.` },
    { variant: "owner" as const, title: "Run a turf? List it free", text: "Take online bookings, get every booking on WhatsApp, and keep your full price." },
  ];
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    document.cookie = `${WELCOMED_COOKIE}=1; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  }, []);

  const go = (i: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };
  const last = active === slides.length - 1;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      <div className="flex justify-end px-4 pt-3">
        <Link href="/" className="rounded-full px-3 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-100">Skip</Link>
      </div>
      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          setActive(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
        className="flex flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-roledescription="carousel"
      >
        {slides.map((s, i) => (
          <section key={s.title} className="flex w-full shrink-0 snap-center flex-col items-center px-6" aria-label={`${i + 1} of ${slides.length}`}>
            <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 shadow-sm">
              <NeighbourhoodMap variant={s.variant} className="block h-auto w-full" />
            </div>
            <h1 className="mt-7 text-center text-2xl font-extrabold tracking-tight">{s.title}</h1>
            <p className="mt-2 max-w-sm text-center text-slate-600">{s.text}</p>
          </section>
        ))}
      </div>
      <div className="safe-bottom space-y-4 px-6 pb-6 pt-4">
        <div className="flex justify-center gap-2" role="tablist" aria-label="Screens">
          {slides.map((s, i) => (
            <button key={s.title} type="button" role="tab" aria-selected={i === active} aria-label={s.title} onClick={() => go(i)} className={`h-2 rounded-full transition-all ${i === active ? "w-6 bg-slate-900" : "w-2 bg-slate-300"}`} />
          ))}
        </div>
        <div className="mx-auto max-w-md space-y-2">
          {last ? (
            <Link href="/signup" className="btn-primary w-full py-3.5 text-base">Let&apos;s play</Link>
          ) : (
            <button type="button" onClick={() => go(active + 1)} className="btn-primary w-full py-3.5 text-base">Next</button>
          )}
          <p className="text-center text-sm text-slate-500">
            Have an account? <Link href="/login" className="font-semibold text-brand-700 hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
