import Link from "next/link";
import { cookies, headers } from "next/headers";
import { isAppUserAgent, resolveView, safeNext, VIEW_COOKIE } from "@/lib/access";
import { googleEnabled } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage(props: { searchParams: Promise<{ next?: string; as?: string }> }) {
  const searchParams = await props.searchParams;
  // Empty when no page was asked for: the form then goes to the chosen side's home.
  const next = safeNext(searchParams.next, "");
  // Google blocks its sign-in page inside app web views ("403 disallowed_useragent"), so the button
  // is only offered in browsers until the app gets native Google sign-in.
  const inApp = isAppUserAgent((await headers()).get("user-agent"));
  // ?as=owner|player (links such as "Turf owners" in the footer) wins over the last choice on this device.
  const initialView = resolveView(null, searchParams.as ?? (await cookies()).get(VIEW_COOKIE)?.value);
  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-4 py-10">
      <div className="card w-full p-6 sm:p-7">
        <LoginForm next={next} google={googleEnabled && !inApp} initialView={initialView} />
        <p className="muted mt-5 text-center text-sm">
          New here? <Link href="/about" className="font-semibold text-brand-700 hover:underline">What is Turfly?</Link>
        </p>
      </div>
    </div>
  );
}
