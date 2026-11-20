import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTurfAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { configsConflict } from "@/lib/engine/allocation";
import { parsePolicy } from "@/lib/engine/policy";
import { rupees } from "@/lib/engine/pricing";
import { getSettings } from "@/lib/settings";
import { formatMinute } from "@/lib/time";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { TurfFields } from "@/components/TurfFields";
import { TurfPhotoManager } from "@/components/TurfPhotoManager";
import { StatusBadge } from "@/components/ui";
import {
  addPricingRule, addUnit, applyPreset, deletePricingRule, deleteUnit, saveConfig, saveHours, savePolicy, setAvailabilityMode, submitForReview, updateTurf,
} from "../../actions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hhmm = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export default async function TurfSettings(
  props: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { turf: t } = await requireTurfAccess(params.id).catch(() => notFound());
  const [turf, cities, settings] = await Promise.all([
    prisma.turf.findUniqueOrThrow({
      where: { id: t.id },
      include: {
        city: { select: { name: true, state: true } },
        hours: true,
        units: { orderBy: { sortOrder: "asc" } },
        configs: { orderBy: { sortOrder: "asc" }, include: { units: true, pricingRules: true } },
      },
    }),
    prisma.city.findMany({ where: { isActive: true } }),
    getSettings(),
  ]);
  const policy = turf.cancellationPolicy ? parsePolicy(turf.cancellationPolicy) : null;
  const effective = policy ?? settings.defaultCancellationPolicy;
  const active = turf.configs.filter((c) => c.isActive);
  const Section = ({ id, title, children, sub }: { id: string; title: string; sub?: string; children: React.ReactNode }) => (
    <section id={id} className="card scroll-mt-24 p-6">
      <h2 className="h2">{title}</h2>
      {sub && <p className="muted mb-4 mt-1">{sub}</p>}
      <div className={sub ? "" : "mt-4"}>{children}</div>
    </section>
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_1fr]">
      <nav className="hidden h-fit space-y-1 text-sm lg:sticky lg:top-24 lg:block">
        {[["status", "Status"], ["layout", "Pitch layout"], ["pricing", "Peak pricing"], ["hours", "Operating hours"], ["policy", "Cancellation"], ["details", "Details & rules"]].map(([id, l]) => (
          <a key={id} href={`#${id}`} className="block rounded-lg px-3 py-1.5 text-slate-600 hover:bg-white">{l}</a>
        ))}
      </nav>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <Link href="/owner/turfs" className="text-sm font-medium text-slate-500">← My turfs</Link>
            <h1 className="h1">{turf.name}</h1>
          </div>
          <Link href={`/turfs/${turf.slug}`} className="btn-ghost btn-sm">View public page</Link>
        </div>
        {searchParams.created && <div className="rounded-2xl bg-brand-50 p-4 text-sm text-brand-800">Turf created! Review the pitch layout, hours and prices below, then submit for approval.</div>}

        <Section id="status" title="Status & availability">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={turf.status} />
            {turf.rejectionReason && <span className="text-sm text-red-700">Reason: {turf.rejectionReason}</span>}
            {["DRAFT", "REJECTED"].includes(turf.status) && <ActionButton action={submitForReview.bind(null, turf.id)} label="Submit for approval" className="btn-primary btn-sm" />}
          </div>
          <ActionForm action={setAvailabilityMode} className="mt-4 flex flex-wrap items-end gap-3" submit="Update">
            <input type="hidden" name="turfId" value={turf.id} />
            <div>
              <label className="label">Availability mode</label>
              <select name="mode" defaultValue={turf.availabilityMode === "NONE" ? "LIVE" : turf.availabilityMode} className="input">
                <option value="LIVE">Live: I manage all bookings here (bookable online)</option>
                <option value="OWNER_REPORTED">Owner-reported: show my grid, but customers must call</option>
              </select>
            </div>
          </ActionForm>
          <p className="mt-2 text-xs text-slate-500">Choose Live only if every booking (including walk-ins and phone calls) is entered here. Otherwise customers may see slots as free that are not.</p>
        </Section>

        <Section id="layout" title="Pitch layout" sub="Areas are physical parts of your ground. Each bookable pitch uses one or more areas. Two pitches that share an area can never be booked at overlapping times.">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Bookable pitches</h3>
              {turf.configs.map((c) => (
                <ActionForm key={c.id} action={saveConfig} className={`rounded-xl border p-3 ${c.isActive ? "border-slate-200" : "border-dashed border-slate-300 opacity-70"}`} submit="Save" submitClass="btn-ghost btn-sm mt-2">
                  <input type="hidden" name="turfId" value={turf.id} />
                  <input type="hidden" name="id" value={c.id} />
                  {/* Phones: the name gets its own line so it isn't cut off */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_80px_100px]">
                    <input name="name" defaultValue={c.name} className="input col-span-2 py-1.5 sm:col-span-1" aria-label="Pitch name" />
                    <select name="playersPerSide" defaultValue={c.playersPerSide} className="input py-1.5" aria-label="Format">
                      {[5, 6, 7, 8, 9, 11].map((n) => <option key={n} value={n}>{n}-a-side</option>)}
                    </select>
                    <label className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₹</span>
                      <input name="price" type="number" min={0} step={50} defaultValue={c.basePricePerHour / 100} className="input py-1.5 pl-7" aria-label="Base price per hour (₹)" title="₹ per hour" />
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-500">Uses:</span>
                    {turf.units.map((u) => (
                      <label key={u.id} className="flex items-center gap-1"><input type="checkbox" name="units" value={u.id} defaultChecked={c.units.some((x) => x.unitId === u.id)} className="accent-brand-600" /> {u.name}</label>
                    ))}
                    <select name="active" defaultValue={c.isActive ? "on" : "off"} className="ml-auto rounded border border-slate-200 px-1 py-0.5"><option value="on">Active</option><option value="off">Hidden</option></select>
                  </div>
                </ActionForm>
              ))}
              <ActionForm action={saveConfig} className="rounded-xl border border-dashed border-slate-300 p-3" submit="Add pitch" submitClass="btn-dark btn-sm mt-2">
                <input type="hidden" name="turfId" value={turf.id} />
                <div className="grid grid-cols-[1fr_80px_100px] gap-2">
                  <input name="name" placeholder="New pitch name" className="input py-1.5" />
                  <select name="playersPerSide" defaultValue={5} className="input py-1.5">{[5, 6, 7, 8, 9, 11].map((n) => <option key={n} value={n}>{n}s</option>)}</select>
                  <input name="price" type="number" min={0} step={50} placeholder="₹/hr" className="input py-1.5" />
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {turf.units.map((u) => (
                    <label key={u.id} className="flex items-center gap-1"><input type="checkbox" name="units" value={u.id} className="accent-brand-600" /> {u.name}</label>
                  ))}
                </div>
              </ActionForm>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-sm font-semibold">Areas</h3>
                <ul className="space-y-1.5 text-sm">
                  {turf.units.map((u) => (
                    <li key={u.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                      <span>{u.name}{u.isVirtual && <span className="ml-1 text-xs text-slate-400">(virtual lock)</span>}</span>
                      <ActionButton action={deleteUnit.bind(null, turf.id, u.id)} label="Remove" className="text-xs text-red-600 hover:underline" confirmText={`Remove ${u.name}?`} />
                    </li>
                  ))}
                </ul>
                <ActionForm action={addUnit} className="mt-2 flex items-start gap-2" submit="Add" submitClass="btn-ghost btn-sm">
                  <input type="hidden" name="turfId" value={turf.id} />
                  <input name="name" placeholder="e.g. Half C" className="input py-1.5" />
                  <label className="flex shrink-0 items-center gap-1 pt-2 text-xs"><input type="checkbox" name="virtual" className="accent-brand-600" /> virtual</label>
                </ActionForm>
              </div>

              {active.length > 1 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Conflict map</h3>
                  <div className="overflow-x-auto">
                    <table className="text-xs">
                      <thead>
                        <tr><th /> {active.map((c) => <th key={c.id} className="px-2 py-1 font-medium text-slate-500">{c.name.split("·")[0]}</th>)}</tr>
                      </thead>
                      <tbody>
                        {active.map((a) => (
                          <tr key={a.id}>
                            <td className="pr-2 font-medium text-slate-500">{a.name.split("·")[0]}</td>
                            {active.map((b) => {
                              const x = a.id === b.id || configsConflict(a.units.map((u) => u.unitId), b.units.map((u) => u.unitId));
                              return <td key={b.id} className={`px-2 py-1 text-center ${x ? "bg-red-50 text-red-600" : "bg-brand-50 text-brand-700"}`}>{x ? "blocks" : "ok"}</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">“blocks” = booking one makes the other unavailable for overlapping times.</p>
                </div>
              )}

              <details className="rounded-xl bg-slate-50 p-3">
                <summary className="cursor-pointer text-sm font-semibold">Quick setup: 7-a-side ↔ two 5-a-side</summary>
                <ActionForm action={applyPreset} className="mt-3 space-y-2 text-sm" submit="Replace layout with this" submitClass="btn-dark btn-sm">
                  <input type="hidden" name="turfId" value={turf.id} />
                  <input type="hidden" name="preset" value="convertible" />
                  <label className="flex items-center gap-2"><input type="checkbox" name="combined" defaultChecked className="accent-brand-600" /> Halves can be combined into one 7-a-side booking</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="simultaneous" defaultChecked className="accent-brand-600" /> Both 5-a-side halves can run at the same time</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input name="price" type="number" defaultValue={1500} className="input py-1.5" title="Full pitch ₹/hr" />
                    <input name="halfPrice" type="number" defaultValue={900} className="input py-1.5" title="Half ₹/hr" />
                  </div>
                  <p className="text-[11px] text-slate-500">Only possible when there are no upcoming bookings.</p>
                </ActionForm>
              </details>
            </div>
          </div>
        </Section>

        <Section id="pricing" title="Peak & off-peak pricing" sub="Rules override the base hourly price during their time window. Prices are prorated per 30 minutes, so a slot that crosses into peak is priced fairly.">
          <div className="space-y-4">
            {active.map((c) => (
              <div key={c.id}>
                <div className="text-sm font-semibold">{c.name} · base {rupees(c.basePricePerHour)}/hr</div>
                <ul className="mt-1 space-y-1 text-sm">
                  {c.pricingRules.map((r) => (
                    <li key={r.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5">
                      <span>{r.label}: {rupees(r.pricePerHour)}/hr · {formatMinute(r.startMinute)}–{formatMinute(r.endMinute)} {r.weekdays.length ? `· ${r.weekdays.map((d) => DAYS[d]).join(", ")}` : "· every day"}</span>
                      <ActionButton action={deletePricingRule.bind(null, turf.id, r.id)} label="Delete" className="text-xs text-red-600 hover:underline" />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <ActionForm action={addPricingRule} className="grid grid-cols-1 gap-2 rounded-xl border border-dashed border-slate-300 p-3 sm:grid-cols-6" submit="Add rule" submitClass="btn-dark btn-sm sm:col-span-6 w-fit">
              <input type="hidden" name="turfId" value={turf.id} />
              <select name="configId" className="input py-1.5 sm:col-span-2">{active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <input name="label" defaultValue="Peak" className="input py-1.5" />
              <input name="start" type="time" defaultValue="18:00" className="input py-1.5" />
              <input name="end" type="time" defaultValue="23:00" className="input py-1.5" />
              <input name="price" type="number" placeholder="₹/hr" className="input py-1.5" />
              <div className="flex flex-wrap gap-2 text-xs sm:col-span-6">
                {DAYS.map((d, i) => <label key={d} className="flex items-center gap-1"><input type="checkbox" name="weekdays" value={i} className="accent-brand-600" /> {d}</label>)}
                <span className="text-slate-400">(none = every day)</span>
              </div>
            </ActionForm>
          </div>
        </Section>

        <Section id="hours" title="Operating hours" sub="Closing times earlier than opening (e.g. 6:00 AM → 1:00 AM) mean you close after midnight.">
          <ActionForm action={saveHours} className="space-y-2">
            <input type="hidden" name="turfId" value={turf.id} />
            {DAYS.map((d, i) => {
              const h = turf.hours.find((x) => x.weekday === i);
              return (
                <div key={d} className="grid grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-1.5 text-sm sm:grid-cols-[60px_1fr_1fr_auto] sm:gap-2">
                  <span className="font-medium">{d}</span>
                  <input name={`open_${i}`} type="time" defaultValue={hhmm(h?.openMinute ?? 360)} className="input min-w-0 px-2 py-1.5" aria-label={`${d} opens`} />
                  <input name={`close_${i}`} type="time" defaultValue={hhmm(h?.closeMinute ?? 1380)} className="input min-w-0 px-2 py-1.5" aria-label={`${d} closes`} />
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" name={`closed_${i}`} defaultChecked={h?.isClosed} className="accent-brand-600" /> Closed</label>
                </div>
              );
            })}
          </ActionForm>
          <p className="mt-2 text-xs text-slate-500">Holidays and one-off closures: use <Link href={`/owner/calendar?turf=${turf.id}`} className="underline">Calendar → Block time</Link>.</p>
        </Section>

        <Section id="policy" title="Cancellation & refund policy" sub="Shown to customers in plain words before they pay. Changes apply to new bookings only.">
          <ActionForm action={savePolicy} className="space-y-2 text-sm">
            <input type="hidden" name="turfId" value={turf.id} />
            <label className="flex items-center gap-2"><input type="checkbox" name="useDefault" defaultChecked={!policy} className="accent-brand-600" /> Use platform default</label>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2">
                Cancel ≥ <input name={`h_${i}`} type="number" min={0} defaultValue={effective.tiers[i]?.minHoursBefore ?? ""} className="input w-20 py-1.5" /> hours before →
                <input name={`p_${i}`} type="number" min={0} max={100} defaultValue={effective.tiers[i]?.refundPercent ?? ""} className="input w-20 py-1.5" /> % refund of booking fee
              </div>
            ))}
            <p className="text-xs text-slate-500">This is for the {rupees(settings.bookingFeePaise)} booking fee players pay online; your price is paid at the turf. Leave all tiers empty to make the booking fee non-refundable. Turf-initiated cancellations always refund 100%.</p>
            <input name="note" placeholder="Extra note (optional, e.g. rain policy)" defaultValue={effective.note} className="input" />
          </ActionForm>
        </Section>

        <Section id="photos" title="Photos" sub="Players see these first. The cover photo is the thumbnail in search results.">
          <TurfPhotoManager turfId={turf.id} initial={turf.photos} />
        </Section>

        <Section id="details" title="Details & booking rules">
          <ActionForm action={updateTurf} className="space-y-5">
            <input type="hidden" name="turfId" value={turf.id} />
            <TurfFields cities={cities} turf={turf} city={turf.city} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="label">Slot start interval</label>
                <select name="slotStepMinutes" defaultValue={turf.slotStepMinutes} className="input">
                  {[60, 30, 15].map((n) => <option key={n} value={n}>{n === 60 ? "Every hour (1-hour slots)" : `Every ${n} min`}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Minimum notice (min)</label>
                <input name="minNoticeMinutes" type="number" min={0} defaultValue={turf.minNoticeMinutes} className="input" />
              </div>
              <div>
                <label className="label">Book up to (days ahead)</label>
                <input name="maxAdvanceDays" type="number" min={1} max={90} defaultValue={turf.maxAdvanceDays} className="input" />
              </div>
            </div>
            <div>
              <label className="label">Booking durations</label>
              <div className="flex flex-wrap gap-3 text-sm">
                {[30, 60, 90, 120, 150, 180].map((d) => (
                  <label key={d} className="flex items-center gap-1"><input type="checkbox" name="durations" value={d} defaultChecked={turf.allowedDurations.includes(d)} className="accent-brand-600" /> {d} min</label>
                ))}
              </div>
            </div>
          </ActionForm>
        </Section>
      </div>
    </div>
  );
}
