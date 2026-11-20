import Link from "next/link";
import { cookies, headers } from "next/headers";
import { CalendarCheck, MapPin, Users } from "lucide-react";
import { isAppUserAgent, resolveView, safeNext, VIEW_COOKIE } from "@/lib/access";
import { googleEnabled } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";
import { NeighbourhoodMap } from "@/components/NeighbourhoodMap";

export default async function LoginPage(props: { searchParams: Promise<{ next?: string; as?: string }> }) {
  const searchParams = await props.searchParams;
  // Empty when no page was asked for: the form then goes to the chosen side's home.
  const next = safeNext(searchParams.next, "");
  // Google blocks its sign-in page inside app web views ("403 disallowed_useragent"), so the button
  // is only offered in browsers until the app gets native Google sign-in.
  const inApp = isAppUserAgent((await headers()).get("user-agent"));
  // ?as=owner|player (links such as "Turf owners" in the footer) wins over the last choice on this device.
  const initialView = resolveView(null, searchParams.as ?? (await cookies()).get(VIEW_COOKIE)?.value);
  const signup = `/signup?${new URLSearchParams({ ...(next ? { next } : {}), as: initialView })}`;
  return (
    <div className="mx-auto grid max-w-5xl items-center gap-6 px-4 py-5 md:grid-cols-[1.05fr_1fr] md:gap-10 md:py-12">
      {/* The neighbourhood: a banner on phones, a full panel with the pitch on larger screens */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <NeighbourhoodMap variant={initialView === "owner" ? "owner" : "players"} crop className="block h-40 w-full sm:h-56 md:h-auto" />
        <div className="hidden space-y-4 p-6 md:block">
          <h2 className="text-2xl font-extrabold leading-tight tracking-tight">Book turfs. Join games.<br />Find players near you.</h2>
          <ul className="space-y-3 text-sm text-slate-600">
            <li className="flex gap-2.5"><MapPin size={18} className="shrink-0 text-brand-600" /> Every turf around you, with free slots, prices and directions.</li>
            <li className="flex gap-2.5"><Users size={18} className="shrink-0 text-brand-600" /> Short of players? Join a game nearby or fill yours.</li>
            <li className="flex gap-2.5"><CalendarCheck size={18} className="shrink-0 text-brand-600" /> Turf owners list free and manage every booking in one place.</li>
          </ul>
        </div>
      </div>
      <div className="card w-full p-6 sm:p-7">
        <LoginForm next={next} google={googleEnabled && !inApp} initialView={initialView} />
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-4 text-center text-sm">
          <span className="muted">New to Turfly?</span>{" "}
          <Link href={signup} className="font-semibold text-brand-700 hover:underline">Create a free account</Link>
          <div className="mt-1 text-xs"><Link href="/about" className="text-slate-500 hover:underline">What is Turfly?</Link></div>
        </div>
      </div>
    </div>
  );
}
