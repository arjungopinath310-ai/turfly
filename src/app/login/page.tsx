import { googleEnabled } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = searchParams.next?.startsWith("/") ? searchParams.next : "/";
  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-4 py-12">
      <div className="card w-full p-7">
        <h1 className="h1">Sign in</h1>
        <p className="muted mt-1">Use your mobile number. We&apos;ll send a 6-digit OTP.</p>
        <LoginForm next={next} google={googleEnabled} />
      </div>
    </div>
  );
}
