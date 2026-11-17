import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Providers } from "@/components/Providers";
import { NativeBridge } from "@/components/NativeBridge";
import { currentUser } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { mockAllowed } from "@/lib/payments/razorpay";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: `${BRAND.name} · Football turfs in Manjeri`,
  description: BRAND.tagline,
  applicationName: BRAND.name,
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#039855", width: "device-width", initialScale: 1, viewportFit: "cover" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser().catch(() => null);
  return (
    <html lang="en" className={font.variable}>
      <body className="min-h-screen font-sans">
        <Providers>
          <NativeBridge signedIn={Boolean(user)} />
          <Navbar />
          {mockAllowed() && (
            <div className="bg-violet-600 px-4 py-1.5 text-center text-xs font-medium text-white">
              Demo version: payments are simulated, so no real money is charged.
            </div>
          )}
          <main>{children}</main>
          <footer className="safe-bottom mt-24 border-t border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-slate-500">
              <nav className="flex flex-wrap gap-x-5 gap-y-2">
                <Link href="/about" className="hover:text-slate-800">About</Link>
                <Link href="/legal/terms" className="hover:text-slate-800">Terms</Link>
                <Link href="/legal/privacy" className="hover:text-slate-800">Privacy</Link>
                <Link href="/legal/refunds" className="hover:text-slate-800">Cancellation &amp; refunds</Link>
                <Link href="/contact" className="hover:text-slate-800">Contact</Link>
                <Link href="/owner/turfs/new" className="hover:text-slate-800">List your turf</Link>
              </nav>
              <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
                <span>© {new Date().getFullYear()} {BRAND.name} · Starting in Manjeri, Kerala</span>
                <span>Live availability is shown only where the turf manages bookings on {BRAND.name}.</span>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
