import Link from "next/link";
import { headers } from "next/headers";
import { isAppUserAgent, safeNext } from "@/lib/access";
import { googleEnabled } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage(props: { searchParams: Promise<{ next?: string }> }) {
  const searchParams = await props.searchParams;
  const next = safeNext(searchParams.next);
  // Google blocks its sign-in page inside app web views ("403 disallowed_useragent"), so the button
  // is only offered in browsers until the app gets native Google sign-in.
  const inApp = isAppUserAgent((await headers()).get("user-agent"));
  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-4 py-12">
      <div className="card w-full p-7">
        <h1 className="h1">Sign in</h1>
        <p className="muted mt-1">Sign in to find turfs, book and manage your team. Use your mobile number; we&apos;ll send a 6-digit OTP.</p>
        <LoginForm next={next} google={googleEnabled && !inApp} />
        <p className="muted mt-5 text-center text-sm">
          New here? <Link href="/about" className="font-semibold text-brand-700 hover:underline">What is Turfly?</Link>
        </p>
      </div>
    </div>
  );
}
