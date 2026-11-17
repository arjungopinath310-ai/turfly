import { pageUser } from "@/lib/auth";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { AMENITIES } from "@/lib/brand";
import { ActionForm } from "@/components/ActionForm";
import { StatusBadge } from "@/components/ui";
import { DigipinField } from "@/components/DigipinField";
import { addUnclaimedTurf, reviewClaim, reviewTurf, setReportedPrice, updateTurfAdmin } from "../actions";

export default async function AdminTurfs(props: { searchParams: Promise<{ status?: string }> }) {
  const searchParams = await props.searchParams;
  await pageUser("/admin/turfs", ["ADMIN"]);
  const [pending, claims, turfs, cities] = await Promise.all([
    prisma.turf.findMany({ where: { status: "PENDING_REVIEW" }, include: { owner: true, city: true, configs: true }, orderBy: { updatedAt: "asc" } }),
    prisma.turfClaim.findMany({ where: { status: "PENDING" }, include: { turf: true, user: true }, orderBy: { createdAt: "asc" } }),
    prisma.turf.findMany({
      where: searchParams.status ? { status: searchParams.status as never } : {},
      include: { owner: { select: { name: true, phone: true } }, city: true, _count: { select: { bookings: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.city.findMany({ where: { isActive: true } }),
  ]);
  const app = process.env.APP_URL ?? "";

  return (
    <div className="space-y-8">
      <section>
        <h1 className="h1 mb-4">Turf approvals</h1>
        {pending.length === 0 && <p className="muted">No turfs awaiting review.</p>}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {pending.map((t) => (
            <div key={t.id} className="card p-5">
              <div className="flex justify-between">
                <div>
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-sm text-slate-500">{t.addressLine}, {t.city.name} {t.pincode}</div>
                  <div className="text-xs text-slate-500">Owner: {t.owner?.name ?? "—"} {t.owner?.phone}</div>
                  <div className="mt-1 text-xs text-slate-500">{t.configs.map((c) => c.name).join(" · ")}</div>
                </div>
                <Link className="btn-ghost btn-sm h-fit" href={`/owner/turfs/${t.id}`}>Inspect</Link>
              </div>
              <ActionForm action={reviewTurf} className="mt-3 flex flex-wrap gap-2" submit={null}>
                <input type="hidden" name="turfId" value={t.id} />
                <input name="reason" placeholder="Reason (required to reject)" className="input flex-1 py-1.5" />
                <button name="decision" value="APPROVED" className="btn-primary btn-sm">Approve</button>
                <button name="decision" value="REJECTED" className="btn-danger btn-sm">Reject</button>
              </ActionForm>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="h2 mb-3">Listing claims</h2>
        {claims.length === 0 && <p className="muted">No pending claims.</p>}
        <div className="space-y-3">
          {claims.map((c) => (
            <div key={c.id} className="card p-5">
              <div className="font-semibold">{c.turf.name} ← {c.user.name ?? c.user.phone}</div>
              <p className="text-sm text-slate-600">“{c.evidence}”</p>
              <p className="text-xs text-slate-500">Claimant phone {c.user.phone ?? "—"} · listing phone {c.turf.phone ?? "—"}. Verify by calling the public number before approving.</p>
              <ActionForm action={reviewClaim} className="mt-3 flex flex-wrap gap-2" submit={null}>
                <input type="hidden" name="claimId" value={c.id} />
                <input name="note" placeholder="Note to claimant" className="input flex-1 py-1.5" />
                <button name="decision" value="APPROVED" className="btn-primary btn-sm">Approve & transfer</button>
                <button name="decision" value="REJECTED" className="btn-danger btn-sm">Reject</button>
              </ActionForm>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="h2">Add unclaimed listing</h2>
        <p className="muted mb-4">Only publicly identifiable business information (signboard name, area, public phone, DIGIPIN). The listing shows “Call to book” and never shows slots until the owner claims it.</p>
        <ActionForm action={addUnclaimedTurf} className="grid grid-cols-1 gap-2 sm:grid-cols-3" submit="Add listing" submitClass="btn-dark sm:col-span-3 w-fit">
          <input name="name" placeholder="Turf name" className="input" />
          <select name="cityId" className="input">{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <input name="locality" placeholder="Area / landmark" className="input" />
          <div className="sm:col-span-2"><DigipinField /></div>
          <input name="pincode" placeholder="PIN code" inputMode="numeric" maxLength={6} className="input self-end" />
          <input name="phone" placeholder="Public phone" className="input" />
          <input name="sourceNote" placeholder="Source of info (e.g. Google Maps listing, signboard visit on 12 Nov)" className="input sm:col-span-3" />
          <div className="flex flex-wrap gap-2 text-xs sm:col-span-3">
            {Object.entries(AMENITIES).map(([k, v]) => <label key={k} className="flex items-center gap-1"><input type="checkbox" name="amenities" value={k} className="accent-brand-600" /> {v}</label>)}
          </div>
        </ActionForm>
      </section>

      <section className="card overflow-x-auto p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="h2 mr-auto">All turfs</h2>
          {["", "APPROVED", "UNCLAIMED", "DRAFT", "PENDING_REVIEW", "REJECTED", "SUSPENDED"].map((s) => (
            <Link key={s} href={`/admin/turfs${s ? `?status=${s}` : ""}`} className={`chip ${String(searchParams.status ?? "") === s ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200"}`}>{s ? s.replace("_", " ").toLowerCase() : "all"}</Link>
          ))}
        </div>
        <table className="table min-w-[1100px]">
          <thead><tr><th>Turf</th><th>Status</th><th>Owner</th><th>Bookings</th><th>Commission % / featured</th><th>Reported price (₹/hour)</th><th>Actions</th></tr></thead>
          <tbody>
            {turfs.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link href={`/turfs/${t.slug}`} className="font-semibold hover:underline">{t.name}</Link>
                  <div className="text-xs text-slate-500">
                    {t.city.name}{t.isDemo ? " · demo" : ""} · <Link href={`/owner/turfs/${t.id}#photos`} className="text-brand-700 hover:underline">{t.photos.length ? `${t.photos.length} photo${t.photos.length === 1 ? "" : "s"}` : "add photos"}</Link>
                  </div>
                  {t.claimToken && <div className="mt-1 break-all font-mono text-[10px] text-sky-700">Claim link: {app}/claim/{t.claimToken}</div>}
                </td>
                <td><StatusBadge status={t.status} /><div className="mt-1"><StatusBadge status={t.availabilityMode} /></div></td>
                <td className="text-xs">{t.owner?.name ?? "—"}<br />{t.owner?.phone}</td>
                <td>{t._count.bookings}</td>
                <td>
                  <ActionForm action={updateTurfAdmin} className="flex items-center gap-2" submit="Save" submitClass="btn-ghost btn-sm">
                    <input type="hidden" name="turfId" value={t.id} />
                    <input name="commission" type="number" step="0.5" min={0} max={50} defaultValue={t.commissionPercent ?? ""} placeholder="default" className="input w-24 py-1" />
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="featured" defaultChecked={t.isFeatured} className="accent-brand-600" /> featured</label>
                  </ActionForm>
                </td>
                <td>
                  {/* Only for turfs that don't manage bookings here; once an owner sets real prices this is not shown. */}
                  {t.availabilityMode === "NONE" ? (
                    <ActionForm action={setReportedPrice} className="flex items-center gap-1" submit="Save" submitClass="btn-ghost btn-sm">
                      <input type="hidden" name="turfId" value={t.id} />
                      <input name="priceFrom" type="number" min={100} max={20000} step={50} defaultValue={t.reportedPriceFrom != null ? t.reportedPriceFrom / 100 : ""} placeholder="from" className="input w-20 py-1" />
                      <input name="note" defaultValue={t.reportedPriceNote ?? ""} placeholder="note, e.g. ₹1,200 after 6 PM" className="input w-44 py-1 text-xs" />
                    </ActionForm>
                  ) : (
                    <span className="text-xs text-slate-400">Owner sets prices</span>
                  )}
                </td>
                <td>
                  {t.status === "UNCLAIMED" && (
                    <ActionForm action={reviewTurf} className="flex gap-1" submit={null}>
                      <input type="hidden" name="turfId" value={t.id} />
                      <input name="reason" placeholder="why (e.g. closed)" className="input w-28 py-1" />
                      <button name="decision" value="REJECTED" className="btn-danger btn-sm">Hide</button>
                    </ActionForm>
                  )}
                  {t.status === "REJECTED" && !t.ownerId && (
                    <ActionForm action={reviewTurf} submit={null}>
                      <input type="hidden" name="turfId" value={t.id} />
                      <button name="decision" value="UNCLAIMED" className="btn-ghost btn-sm">Show again</button>
                    </ActionForm>
                  )}
                  {t.status === "APPROVED" && (
                    <ActionForm action={reviewTurf} className="flex gap-1" submit={null}>
                      <input type="hidden" name="turfId" value={t.id} />
                      <input name="reason" placeholder="reason" className="input w-28 py-1" />
                      <button name="decision" value="SUSPENDED" className="btn-danger btn-sm">Suspend</button>
                    </ActionForm>
                  )}
                  {t.status === "SUSPENDED" && (
                    <ActionForm action={reviewTurf} submit={null}>
                      <input type="hidden" name="turfId" value={t.id} />
                      <button name="decision" value="APPROVED" className="btn-ghost btn-sm">Reinstate</button>
                    </ActionForm>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
