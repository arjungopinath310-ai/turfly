import Link from "next/link";
import { MapPin, Phone } from "lucide-react";
import { pageUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";
import { requestClaim } from "../actions";

/** "Find my turf": an owner searches the public listings and asks to manage theirs (an admin confirms by phone). */
export default async function FindMyTurf(props: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await props.searchParams;
  const user = await pageUser("/owner/claim");
  const term = q.trim();
  const [turfs, mine] = await Promise.all([
    term.length >= 2
      ? prisma.turf.findMany({
          where: {
            status: "UNCLAIMED",
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { locality: { contains: term, mode: "insensitive" } },
              { addressLine: { contains: term, mode: "insensitive" } },
              { city: { name: { contains: term, mode: "insensitive" } } },
              { pincode: term },
            ],
          },
          include: { city: true },
          orderBy: { name: "asc" },
          take: 30,
        })
      : [],
    prisma.turfClaim.findMany({ where: { userId: user.id, status: "PENDING" }, select: { turfId: true } }),
  ]);
  const requested = new Set(mine.map((c) => c.turfId));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Find my turf" subtitle="Search by your turf's name, the place or the PIN code." />
      <form className="mb-5 flex gap-2">
        <input name="q" defaultValue={q} className="input flex-1" placeholder="e.g. Club Arena, Kacherippadi, 676121" aria-label="Turf name or place" autoFocus />
        <button className="btn-primary">Search</button>
      </form>

      {term.length >= 2 && turfs.length === 0 && (
        <div className="card p-5 text-sm">
          No listed turf matches “{term}”. Try a shorter name or the place, or{" "}
          <Link href="/owner/turfs/new" className="font-semibold text-brand-700 underline">add your turf</Link>.
        </div>
      )}

      <div className="space-y-3">
        {turfs.map((t) => (
          <div key={t.id} className="card p-4">
            <div className="font-semibold">{t.name}</div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-slate-500">
              <span className="flex items-center gap-1"><MapPin size={14} /> {t.locality ? `${t.locality}, ` : ""}{t.city.name} {t.pincode}</span>
              {t.phone && <span className="flex items-center gap-1"><Phone size={14} /> {t.phone}</span>}
            </div>
            {requested.has(t.id) ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Request sent. We&apos;ll call the turf to confirm.</p>
            ) : (
              <details className="mt-3">
                <summary className="btn-ghost btn-sm w-fit cursor-pointer list-none">This is my turf</summary>
                <ActionForm action={requestClaim} submit="Send request" className="mt-3 space-y-2">
                  <input type="hidden" name="turfId" value={t.id} />
                  <label className="label">How can we confirm it&apos;s yours?</label>
                  <textarea name="evidence" rows={3} className="input" placeholder="Your name, your role (owner / manager) and the turf's phone number. We'll call it to confirm." />
                </ActionForm>
              </details>
            )}
          </div>
        ))}
      </div>

      <p className="muted mt-6 text-center text-sm">
        Can&apos;t find it? <Link href="/owner/turfs/new" className="font-semibold text-brand-700 hover:underline">Add your turf</Link>
      </p>
    </div>
  );
}
