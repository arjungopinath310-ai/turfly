import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ActionForm } from "@/components/ActionForm";
import { claimListing } from "@/app/owner/actions";

export default async function ClaimPage({ params }: { params: { token: string } }) {
  const turf = await prisma.turf.findUnique({ where: { claimToken: params.token }, include: { city: true } });
  if (!turf || turf.status !== "UNCLAIMED") notFound();
  const user = await currentUser();
  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <div className="card space-y-4 p-7">
        <div className="text-sm text-slate-500">Claim your listing</div>
        <h1 className="h1">{turf.name}</h1>
        <p className="text-sm text-slate-600">{turf.addressLine}, {turf.city.name}</p>
        <p className="text-sm">Once verified, you&apos;ll be able to manage pitches, prices and live bookings for this turf.</p>
        {user ? (
          <ActionForm action={claimListing} submit="Submit claim" className="space-y-3">
            <input type="hidden" name="token" value={params.token} />
            <label className="label">How can we verify you own or manage this turf?</label>
            <textarea name="evidence" rows={4} className="input" placeholder="Your role, GSTIN or trade licence number, and the public phone number listed above (we'll call it)." />
          </ActionForm>
        ) : (
          <Link href={`/login?next=/claim/${params.token}`} className="btn-primary w-full">Sign in to claim</Link>
        )}
      </div>
    </div>
  );
}
