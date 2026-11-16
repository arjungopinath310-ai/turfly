import Link from "next/link";
import { business } from "@/lib/business";

/** Shared shell for legal pages: readable typography, last-updated date, links between policies. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  const b = business();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="h1">{title}</h1>
      <p className="muted mt-1">{b.brand} · operated by {b.legalName} · Last updated {b.updated}</p>
      {!b.configured && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Template: the business details in [brackets] still need to be filled in, and this policy should be reviewed by a lawyer before launch.
        </p>
      )}
      <div className="legal mt-6 space-y-4 text-[15px] leading-relaxed text-slate-700">{children}</div>
      <nav className="mt-10 flex flex-wrap gap-4 border-t border-slate-200 pt-4 text-sm text-slate-500">
        <Link href="/legal/terms" className="hover:underline">Terms of use</Link>
        <Link href="/legal/privacy" className="hover:underline">Privacy policy</Link>
        <Link href="/legal/refunds" className="hover:underline">Cancellation &amp; refunds</Link>
        <Link href="/contact" className="hover:underline">Contact</Link>
        <Link href="/account/delete" className="hover:underline">Delete your account</Link>
      </nav>
    </div>
  );
}

export const H = ({ children }: { children: React.ReactNode }) => <h2 className="pt-2 text-lg font-semibold text-slate-900">{children}</h2>;
