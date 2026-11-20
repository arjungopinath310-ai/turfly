import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { CalendarCheck, MapPin, ShieldCheck, Users } from "lucide-react";
import { homeFor, resolveView, safeNext, VIEW_COOKIE } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { rupees } from "@/lib/engine/pricing";
import { SignupForm } from "@/components/SignupForm";

export const metadata = { title: "Create your account" };

export default async function SignupPage(props: { searchParams: Promise<{ next?: string; as?: string }> }) {
  const searchParams = await props.searchParams;
  const next = safeNext(searchParams.next, "");
  const initialView = resolveView(null, searchParams.as ?? (await cookies()).get(VIEW_COOKIE)?.value);
  // Already signed in: nothing to create
  if (await currentUser()) redirect(next || homeFor(initialView));
  const fee = rupees((await getSettings()).bookingFeePaise);
  const login = `/login?${new URLSearchParams({ ...(next ? { next } : {}), as: initialView })}`;
  return (
    <div className="mx-auto grid max-w-5xl items-center gap-8 px-4 py-8 md:grid-cols-[1fr_1.1fr] md:py-14">
      <div className="hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-8 text-white shadow-xl md:block">
        <div className="text-sm font-semibold uppercase tracking-wider text-brand-100">Turfly</div>
        <h2 className="mt-2 text-3xl font-bold leading-tight">Football turfs near you, one tap away.</h2>
        <ul className="mt-8 space-y-5 text-sm">
          {[
            [MapPin, "Turfs around you", "See every turf nearby with live free slots, prices and photos."],
            [CalendarCheck, `Book for ${fee}`, "Reserve online for a small booking fee and pay the turf's price at the turf."],
            [Users, "Short of players?", "Find a game that needs players, or get players for yours."],
            [ShieldCheck, "Free for turf owners", "List your turf, take walk-ins and online bookings in one calendar."],
          ].map(([Icon, title, text]) => {
            const I = Icon as typeof MapPin;
            return (
              <li key={title as string} className="flex gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15"><I size={18} /></span>
                <span><b className="block">{title as string}</b><span className="text-brand-100">{text as string}</span></span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="card w-full p-6 sm:p-7">
        <SignupForm next={next} initialView={initialView} fee={fee} />
        <p className="muted mt-5 text-center text-sm">
          Already have an account? <Link href={login} className="font-semibold text-brand-700 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
