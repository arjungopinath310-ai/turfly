import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Providers } from "@/components/Providers";
import { BRAND } from "@/lib/brand";
import { mockAllowed } from "@/lib/payments/razorpay";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = { title: `${BRAND.name} · Football turfs in Manjeri`, description: BRAND.tagline };
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={font.variable}>
      <body className="min-h-screen font-sans">
        <Providers>
          {mockAllowed() && (
            <div className="bg-violet-600 px-4 py-1.5 text-center text-xs font-medium text-white">
              Demo version: payments are simulated (no real money is charged) and turfs marked “Demo listing” are fictional.
            </div>
          )}
          <Navbar />
          <main>{children}</main>
          <footer className="mt-24 border-t border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:justify-between">
              <span>© {new Date().getFullYear()} {BRAND.name} · Starting in Manjeri, Kerala</span>
              <span>Live availability is shown only where the turf manages bookings on {BRAND.name}.</span>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
