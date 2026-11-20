import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Providers } from "@/components/Providers";
import { NativeBridge } from "@/components/NativeBridge";
import { MobileTabBar } from "@/components/MobileTabBar";
import { currentView } from "@/lib/view";
import { currentUser } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { mockAllowed } from "@/lib/payments/razorpay";

// Barlow for reading, its condensed cut for headings, buttons and numbers (sports-kit lettering)
const sans = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const display = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700", "800"], style: ["normal", "italic"], variable: "--font-display" });

export const metadata: Metadata = {
  title: `${BRAND.name} · Book football turfs near you`,
  description: BRAND.tagline,
  applicationName: BRAND.name,
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#0f1a13", width: "device-width", initialScale: 1, viewportFit: "cover" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser().catch(() => null);
  const view = user ? await currentView(user.role) : null;
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-screen font-sans">
        <Providers>
          <NativeBridge signedIn={Boolean(user)} />
          <Navbar />
          {mockAllowed() && (
            <div className="bg-volt px-4 py-1 text-center font-display text-[12px] font-bold uppercase tracking-[.12em] text-ink sm:text-[13px]">
              <span className="sm:hidden">Demo: payments are simulated</span>
              <span className="hidden sm:inline">Demo version: payments are simulated, so no real money is charged.</span>
            </div>
          )}
          {/* Signed in on a phone: room for the bottom tab bar / action bar; the web footer is replaced by the account menu. */}
          <main className="pb-24 md:pb-0">{children}</main>
          <footer className={`mt-24 bg-ink text-slate-400 ${user ? "hidden md:block" : "safe-bottom"}`}>
            <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm">
              <div className="font-display text-2xl font-extrabold uppercase italic text-white">{BRAND.name}<span className="text-volt">.</span></div>
              <nav className="flex flex-wrap gap-x-5 gap-y-2 text-slate-300">
                {view !== "owner" && <Link href="/about" className="hover:text-volt">About</Link>}
                <Link href="/legal/terms" className="hover:text-volt">Terms</Link>
                <Link href="/legal/privacy" className="hover:text-volt">Privacy</Link>
                <Link href="/legal/refunds" className="hover:text-volt">Cancellation &amp; refunds</Link>
                <Link href="/contact" className="hover:text-volt">{view === "owner" ? "Help & contact" : "Contact"}</Link>
                {/* Signed-out visitors: a way in for turf owners. Signed-in players never see owner options. */}
                {!user && <Link href="/signup?as=owner" className="hover:text-volt">List your turf free</Link>}
              </nav>
              <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
                <span>© {new Date().getFullYear()} {BRAND.name} · Football turfs across India</span>
                {view !== "owner" && <span>Live availability is shown only where the turf manages bookings on {BRAND.name}.</span>}
              </div>
            </div>
          </footer>
          {user && view ? <MobileTabBar view={view} admin={user.role === "ADMIN"} /> : !user && <MobileTabBar view="guest" admin={false} />}
        </Providers>
      </body>
    </html>
  );
}
