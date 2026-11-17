import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, MapPin, Navigation, Phone, Share2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { AMENITIES } from "@/lib/brand";
import { rupees } from "@/lib/engine/pricing";
import { describePolicy, refundabilityLabel } from "@/lib/engine/policy";
import { getSettings, turfPolicy } from "@/lib/settings";
import { directionsUrl, mapsSearchUrl, turfShareText, whatsappShare } from "@/lib/share";
import { formatDateLong, formatMinute, todayIst } from "@/lib/time";
import { AvailabilityBadge, DemoBadge, Stars } from "@/components/ui";
import { BookingWidget } from "@/components/BookingWidget";
import { MessageButton } from "@/components/MessageButton";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function TurfPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const turf = await prisma.turf.findUnique({
    where: { slug: params.slug },
    include: {
      city: true,
      hours: { orderBy: { weekday: "asc" } },
      configs: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { pricingRules: true } },
      reviews: { orderBy: { createdAt: "desc" }, take: 10, include: { user: { select: { name: true } } } },
    },
  });
  if (!turf || !["APPROVED", "UNCLAIMED"].includes(turf.status)) notFound();
  const [settings, user] = await Promise.all([getSettings(), currentUser()]);
  const policy = turfPolicy(turf, settings);
  const bookable = turf.status === "APPROVED" && turf.availabilityMode === "LIVE";
  // Listed from public information only (or not on the booking calendar): no booking here, so no
  // cancellation policy; point players to the turf's phone and its Google Maps listing instead.
  const contactOnly = turf.availabilityMode === "NONE";
  const mapsUrl = mapsSearchUrl(turf);
  const avg = (k: "turfQuality" | "cleanliness" | "lighting" | "parking") =>
    turf.reviews.length ? turf.reviews.reduce((a, r) => a + r[k], 0) / turf.reviews.length : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid grid-cols-1 gap-2 overflow-hidden rounded-3xl sm:grid-cols-[2fr_1fr]">
        <div className="relative aspect-[16/9] bg-gradient-to-br from-brand-700 to-brand-950 sm:aspect-auto sm:h-[360px]">
          {turf.photos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={turf.photos[0]} alt={turf.name} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-7xl opacity-50">⚽</div>
          )}
        </div>
        <div className="hidden grid-rows-2 gap-2 sm:grid">
          {[1, 2].map((i) =>
            turf.photos[i] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={turf.photos[i]} alt="" className="h-full w-full object-cover" />
            ) : (
              <div key={i} className="bg-gradient-to-br from-brand-600/70 to-brand-900" />
            ),
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_400px]">
        <div className="space-y-8">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <AvailabilityBadge mode={turf.availabilityMode} updatedAt={turf.availabilityUpdatedAt} />
              {turf.isDemo && <DemoBadge />}
              {turf.status === "UNCLAIMED" && <span className="chip border-sky-200 bg-sky-50 text-sky-700">Unclaimed listing</span>}
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{turf.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
              <span className="flex items-center gap-1"><MapPin size={15} /> {turf.addressLine}, {turf.locality && turf.locality !== turf.addressLine ? `${turf.locality}, ` : ""}{turf.city.name} {turf.pincode}</span>
              {turf.ratingCount > 0 && <span className="flex items-center gap-1"><Stars value={turf.ratingAvg} /> {turf.ratingAvg.toFixed(1)} ({turf.ratingCount})</span>}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={directionsUrl(turf)} target="_blank" className="btn-ghost btn-sm"><Navigation size={14} /> Directions</a>
              {turf.phone && <a href={`tel:${turf.phone}`} className="btn-ghost btn-sm"><Phone size={14} /> {turf.phone}</a>}
              {contactOnly && <a href={mapsUrl} target="_blank" rel="noopener" className="btn-ghost btn-sm"><MapPin size={14} /> Google Maps</a>}
              {turf.status === "APPROVED" && turf.ownerId && turf.ownerId !== user?.id && <MessageButton turfId={turf.id} signedIn={Boolean(user)} />}
              <a href={whatsappShare(turfShareText(turf))} target="_blank" className="btn-ghost btn-sm"><Share2 size={14} /> Share on WhatsApp</a>
              <Link href={`/compare?ids=${turf.id}`} className="btn-ghost btn-sm">Compare</Link>
            </div>
            {turf.description && <p className="mt-4 max-w-2xl text-slate-700">{turf.description}</p>}
          </div>

          <section>
            <h2 className="h2 mb-3">Pitches & pricing</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {turf.configs.map((c) => (
                <div key={c.id} className="card p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{c.name}</div>
                    <span className="chip border-slate-200">{c.playersPerSide}-a-side</span>
                  </div>
                  <div className="mt-2 text-sm">{rupees(c.basePricePerHour)} / hour</div>
                  {c.pricingRules.map((r) => (
                    <div key={r.id} className="text-xs text-slate-500">
                      {r.label}: {rupees(r.pricePerHour)}/hr · {formatMinute(r.startMinute)}–{formatMinute(r.endMinute)}
                      {r.weekdays.length ? ` · ${r.weekdays.map((d) => DAYS[d]).join(", ")}` : ""}
                    </div>
                  ))}
                </div>
              ))}
              {turf.configs.length === 0 &&
                (turf.reportedPriceFrom != null ? (
                  <div className="card p-4 sm:col-span-2">
                    <div className="font-semibold">Reported: from {rupees(turf.reportedPriceFrom)} / hour</div>
                    {turf.reportedPriceNote && <div className="mt-0.5 text-sm text-slate-600">{turf.reportedPriceNote}</div>}
                    <div className="mt-1 text-xs text-slate-500">Not confirmed by the turf{turf.reportedPriceAt ? `; reported ${formatDateLong(turf.reportedPriceAt)}` : ""}.</div>
                  </div>
                ) : (
                  <p className="muted sm:col-span-2">
                    Prices aren&apos;t on {"Turfly"} yet. Ask when you call{contactOnly ? <>, or see recent player reviews on <a href={mapsUrl} target="_blank" rel="noopener" className="underline">Google Maps</a></> : null}.
                  </p>
                ))}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <h2 className="h2 mb-3">Amenities</h2>
              <div className="flex flex-wrap gap-2">
                {turf.amenities.map((a) => (
                  <span key={a} className="chip border-brand-200 bg-brand-50 text-brand-800">✓ {AMENITIES[a] ?? a}</span>
                ))}
                {turf.amenities.length === 0 && <span className="muted">Not known yet</span>}
              </div>
            </div>
            <div>
              <h2 className="h2 mb-3 flex items-center gap-2"><Clock size={18} /> Operating hours</h2>
              <ul className="space-y-1 text-sm">
                {turf.hours.map((h) => (
                  <li key={h.id} className="flex justify-between">
                    <span className="text-slate-500">{DAYS[h.weekday]}</span>
                    <span>{h.isClosed ? "Closed" : `${formatMinute(h.openMinute)} – ${formatMinute(h.closeMinute)}`}</span>
                  </li>
                ))}
                {turf.hours.length === 0 && <li className="muted">Not known yet</li>}
              </ul>
            </div>
          </section>

          {!contactOnly && (
            <section>
              <h2 className="h2 mb-2">Cancellation policy · <span className="text-brand-700">{refundabilityLabel(policy)}</span></h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                {describePolicy(policy, settings.advanceAmountPaise).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="h2 mb-3">Reviews from verified bookings</h2>
            {turf.reviews.length > 0 && (
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["turfQuality", "cleanliness", "lighting", "parking"] as const).map((k) => (
                  <div key={k} className="card p-3 text-center">
                    <div className="text-lg font-bold">{avg(k).toFixed(1)}</div>
                    <div className="text-xs capitalize text-slate-500">{k.replace("turfQuality", "turf quality")}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-3">
              {turf.reviews.map((r) => (
                <div key={r.id} className="card p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{r.user.name ?? "Player"}</span>
                    <span className="text-slate-400">{formatDateLong(r.createdAt)}</span>
                  </div>
                  <Stars value={r.overall} />
                  {r.comment && <p className="mt-1 text-sm text-slate-700">{r.comment}</p>}
                </div>
              ))}
              {turf.reviews.length === 0 && (
                <p className="muted">
                  No reviews yet. Only players who booked through {"Turfly"} can review.
                  {contactOnly && <> Reviews by other players are on <a href={mapsUrl} target="_blank" rel="noopener" className="underline">Google Maps</a>.</>}
                </p>
              )}
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-20 lg:h-fit">
          {turf.availabilityMode === "NONE" ? (
            <div className="card space-y-3 p-5">
              <h3 className="h2">Booking</h3>
              <p className="muted">
                This turf isn&apos;t taking bookings on {"Turfly"} yet, so we can&apos;t show free slots.{turf.phone ? " Call the turf to book." : ""}
              </p>
              {turf.reportedPriceFrom != null && (
                <p className="text-sm">Reported price: from <b>{rupees(turf.reportedPriceFrom)}</b> / hour (not confirmed; ask when you call).</p>
              )}
              {turf.phone ? (
                <a href={`tel:${turf.phone}`} className="btn-primary w-full"><Phone size={16} /> Call {turf.phone}</a>
              ) : (
                <p className="text-sm text-slate-600">We don&apos;t have this turf&apos;s phone number yet. Its Google Maps listing usually has it, with photos and reviews.</p>
              )}
              <a href={mapsUrl} target="_blank" rel="noopener" className={`${turf.phone ? "btn-ghost" : "btn-primary"} w-full`}><MapPin size={16} /> Open in Google Maps</a>
              {turf.status === "UNCLAIMED" && (
                <p className="text-xs text-slate-500">Are you the owner? Ask us for your claim link, or <Link href="/owner/turfs/new" className="underline">register</Link>.</p>
              )}
              {turf.sourceNote && <p className="text-xs text-slate-400">Listing info source: {turf.sourceNote}</p>}
            </div>
          ) : (
            <BookingWidget
              turfId={turf.id}
              durations={turf.allowedDurations}
              today={todayIst()}
              maxDays={Math.min(turf.maxAdvanceDays, 30)}
              bookable={bookable}
              signedIn={Boolean(user)}
              advance={settings.advanceAmountPaise}
              fullOnline={turf.fullOnlinePaymentEnabled}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
