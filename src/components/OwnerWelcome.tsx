import Link from "next/link";
import { PlusCircle, Search } from "lucide-react";
import { prisma } from "@/lib/db";

/** Owner home for someone who doesn't manage a turf yet: find their listed turf, or add a new one. */
export async function OwnerWelcome({ userId, name }: { userId: string; name: string | null }) {
  const claims = await prisma.turfClaim.findMany({
    where: { userId, status: { in: ["PENDING", "REJECTED"] } },
    include: { turf: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const first = name?.trim().split(/\s+/)[0];
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <div>
        <h1 className="h1">{first ? `Welcome, ${first}` : "Welcome"} 👋</h1>
        <p className="muted mt-1">Let&apos;s get your turf on Turfly. It&apos;s free to list.</p>
      </div>

      {claims.map((c) => (
        <div key={c.id} className={`rounded-2xl border p-4 text-sm ${c.status === "PENDING" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-800"}`}>
          {c.status === "PENDING" ? (
            <><b>{c.turf.name}</b>: we&apos;re checking your request. We&apos;ll call the turf to confirm, usually within a day.</>
          ) : (
            <><b>{c.turf.name}</b>: we couldn&apos;t confirm your request{c.reviewNote ? ` (${c.reviewNote})` : ""}. Contact us if this is your turf.</>
          )}
        </div>
      ))}

      <div className="card space-y-3 p-5">
        <div className="flex items-center gap-2 font-semibold"><Search size={18} className="text-brand-600" /> Is your turf already on Turfly?</div>
        <p className="muted text-sm">Turfly lists turfs all over India, many before their owners join. Find yours and ask to manage it.</p>
        <form action="/owner/claim" className="flex gap-2">
          <input name="q" className="input flex-1" placeholder="Your turf's name or place" aria-label="Your turf's name or place" />
          <button className="btn-primary">Find</button>
        </form>
      </div>

      <div className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 font-semibold"><PlusCircle size={18} className="text-brand-600" /> Not listed yet?</div>
          <p className="muted text-sm">Add your turf, its pitches and prices. We check it, then players can book.</p>
        </div>
        <Link href="/owner/turfs/new" className="btn-dark shrink-0">Add my turf</Link>
      </div>
    </div>
  );
}
