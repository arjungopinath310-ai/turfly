import { pageUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { describePolicy } from "@/lib/engine/policy";
import { rupees } from "@/lib/engine/pricing";
import { getSettings } from "@/lib/settings";
import { formatIst } from "@/lib/time";
import { razorpayConfigured } from "@/lib/payments/razorpay";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { createOffer, savePlatformSettings, toggleOffer } from "../actions";

export default async function Settings() {
  await pageUser("/admin/settings", ["ADMIN"]);
  const [s, offers, turfs] = await Promise.all([
    getSettings(),
    prisma.offer.findMany({ orderBy: { createdAt: "desc" }, include: { turf: { select: { name: true } } } }),
    prisma.turf.findMany({ where: { status: "APPROVED" }, select: { id: true, name: true } }),
  ]);
  const integrations = [
    ["Razorpay", razorpayConfigured()],
    ["MSG91 SMS", Boolean(process.env.MSG91_AUTH_KEY)],
    ["WhatsApp Cloud API", Boolean(process.env.WHATSAPP_TOKEN)],
    ["Email (Resend)", Boolean(process.env.RESEND_API_KEY)],
    ["Google sign-in", Boolean(process.env.GOOGLE_CLIENT_ID)],
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="card p-6">
        <h1 className="h2">Booking fees & policy</h1>
        <p className="muted mb-4">Changes apply to new bookings. Existing bookings keep the amounts and policy shown when they were paid.</p>
        <ActionForm action={savePlatformSettings} className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Advance per booking (₹)</label><input name="advance" type="number" step="1" min={1} defaultValue={s.advanceAmountPaise / 100} className="input" /></div>
            <div><label className="label">Platform fee to customer (₹)</label><input name="fee" type="number" step="1" min={0} defaultValue={s.platformFeePaise / 100} className="input" /></div>
            <div><label className="label">Checkout hold (minutes)</label><input name="holdMinutes" type="number" min={2} max={30} defaultValue={s.holdMinutes} className="input" /></div>
            <div><label className="label">Default commission (%)</label><input name="commission" type="number" step="0.5" min={0} max={50} defaultValue={s.defaultCommissionPercent} className="input" /></div>
          </div>
          <p className="text-xs text-slate-500">Platform fee is shown as its own line and added on top. Commission is charged to turf owners in their ledger, never deducted silently from the customer&apos;s advance. Per-turf commission overrides are in Turfs.</p>
          <div>
            <label className="label">Default cancellation policy</label>
            {[0, 1, 2].map((i) => (
              <div key={i} className="mb-1 flex items-center gap-2">
                ≥ <input name={`h_${i}`} type="number" min={0} defaultValue={s.defaultCancellationPolicy.tiers[i]?.minHoursBefore ?? ""} className="input w-20 py-1.5" /> h before →
                <input name={`p_${i}`} type="number" min={0} max={100} defaultValue={s.defaultCancellationPolicy.tiers[i]?.refundPercent ?? ""} className="input w-20 py-1.5" /> % refund
              </div>
            ))}
            <ul className="mt-2 list-disc pl-4 text-xs text-slate-500">{describePolicy(s.defaultCancellationPolicy, s.advanceAmountPaise).map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
          <div>
            <label className="label">Reminders</label>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-1"><input type="checkbox" name="h24" defaultChecked={s.reminders.h24} className="accent-brand-600" /> 24 h before</label>
              <label className="flex items-center gap-1"><input type="checkbox" name="h2" defaultChecked={s.reminders.h2} className="accent-brand-600" /> 2 h before</label>
              <label className="flex items-center gap-1"><input type="checkbox" name="balance" defaultChecked={s.reminders.balance} className="accent-brand-600" /> Balance pending (3 h before)</label>
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              {(["SMS", "WHATSAPP", "EMAIL"] as const).map((c) => <label key={c} className="flex items-center gap-1"><input type="checkbox" name="channels" value={c} defaultChecked={s.reminders.channels.includes(c)} className="accent-brand-600" /> {c.toLowerCase()}</label>)}
              <span className="text-xs text-slate-400">(in-app always on)</span>
            </div>
          </div>
        </ActionForm>
      </section>

      <div className="space-y-6">
        <section className="card p-6">
          <h2 className="h2 mb-3">Integrations</h2>
          <ul className="space-y-1 text-sm">
            {integrations.map(([n, ok]) => <li key={n} className="flex justify-between"><span>{n}</span><span className={ok ? "text-brand-700" : "text-amber-600"}>{ok ? "configured" : "not configured"}</span></li>)}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Set keys in environment variables (see .env.example). Without Razorpay the mock gateway is used in development only.</p>
        </section>

        <section className="card p-6">
          <h2 className="h2 mb-3">Offers & promotions</h2>
          <ActionForm action={createOffer} className="grid grid-cols-2 gap-2 text-sm" submit="Create offer" submitClass="btn-dark btn-sm col-span-2 w-fit">
            <input name="code" placeholder="CODE" className="input uppercase" />
            <input name="title" placeholder="Title shown to users" className="input" />
            <select name="kind" className="input"><option value="PROMO">Promo</option><option value="FIRST_BOOKING">First booking</option><option value="REPEAT">Repeat customer</option><option value="REFERRAL">Referral</option></select>
            <select name="turfId" className="input"><option value="">All turfs</option>{turfs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <select name="discountType" className="input"><option value="PERCENT">% off</option><option value="FLAT">₹ off</option></select>
            <input name="value" type="number" placeholder="Value" className="input" />
            <input name="max" type="number" placeholder="Max ₹ discount" className="input" />
            <input name="usageLimit" type="number" placeholder="Usage limit" className="input" />
            <input name="minBookings" type="number" placeholder="Min bookings (repeat)" className="input" />
            <input name="validTo" type="date" className="input" />
            <p className="col-span-2 text-[11px] text-slate-500">Discounts reduce the amount paid at the venue. The online advance stays fixed.</p>
          </ActionForm>
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {offers.map((o) => (
              <li key={o.id} className="flex items-center justify-between py-2">
                <span>
                  <b className="font-mono">{o.code}</b> · {o.title}
                  <span className="block text-xs text-slate-500">
                    {o.kind.toLowerCase().replace("_", " ")} · {o.discountType === "PERCENT" ? `${o.value}%` : rupees(o.value)} {o.maxDiscountPaise ? `(max ${rupees(o.maxDiscountPaise)})` : ""} · used {o.usedCount}{o.usageLimit ? `/${o.usageLimit}` : ""} · {o.turf?.name ?? "all turfs"}{o.validTo ? ` · until ${formatIst(o.validTo, { dateStyle: "medium" })}` : ""}
                  </span>
                </span>
                <ActionButton action={toggleOffer.bind(null, o.id)} label={o.isActive ? "Disable" : "Enable"} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
