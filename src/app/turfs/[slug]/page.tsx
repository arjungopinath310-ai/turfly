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
import { currentView } from "@/lib/view";
import { BackButton } from "@/components/BackButton";
import { DigipinChip } from "@/components/DigipinChip";
import { TurfThumb } from "@/components/TurfThumb";
import { encodeDigipin } from "@/lib/digipin";
import { formatDateLong, formatMinute, todayIst } from "@/lib/time";
import { AvailabilityBadge, DemoBadge, Stars } from "@/components/ui";
import { BookingWidget } from "@/components/BookingWidget";
import { MessageButton } from "@/components/MessageButton";
import { formatPhone } from "@/lib/format";

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
  // A private sample copy is visible only to the person it belongs to (and admins)
  if (turf.isSandbox && turf.ownerId !== user?.id && user?.role !== "ADMIN") notFound();
  const view = await currentView(user?.role);
  const policy = turfPolicy(turf, settings);
  const bookable = turf.status === "APPROVED" && turf.availabilityMode === "LIVE";
  // Listed from public information only (or not on the booking calendar): no booking here, so no
  // cancellation policy; point players to the turf's phone and its Google Maps listing instead.
  const contactOnly = turf.availabilityMode === "NONE";
  const mapsUrl = mapsSearchUrl(turf);
  const digipin = encodeDigipin(turf.lat, turf.lng);
  const avg = (k: "turfQuality" | "cleanliness" | "lighting" | "parking") =>
    turf.reviews.length ? turf.reviews.reduce((a, r) => a + r[k], 0) / turf.reviews.length : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 sm:py-8">
      {/* Photos: swipe through them on phones; main + two smaller on wide screens; a drawn pitch until there are any. */}
      <div className={`-mx-4 grid grid-cols-1 gap-2 overflow-hidden sm:mx-0 sm:rounded-3xl ${turf.photos.length >= 3 ? "sm:grid-cols-[2fr_1fr]" : ""}`}>
        <div className="relative aspect-[2/1] bg-brand-800 sm:aspect-auto sm:h-[360px]">
          {turf.photos.length > 1 ? (
            <div className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] sm:block sm:overflow-hidden">
              {turf.photos.map((p, i) => (
                <div key={p} className={`h-full w-full shrink-0 snap-center ${i > 0 ? "sm:hidden" : ""}`}>
                  <TurfThumb photo={p} name={turf.name} eager={i === 0} />
                </div>
              ))}
            </div>
          ) : (
            <TurfThumb photo={turf.photos[0]} name={turf.name} eager />
          )}
          {turf.photos.length > 1 && (
            <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white sm:hidden">{turf.photos.length} photos · swipe</span>
          )}
          <BackButton />
        </div>
        {turf.photos.length >= 3 && (
          <div className="hidden grid-rows-2 gap-2 sm:grid">
            {[1, 2].map((i) => (
              <TurfThumb key={i} photo={turf.photos[i]} name={turf.name} />
            ))}
          </div>
        )}
      </div>

      {/* Phones: name → booking → details. Wide screens: booking panel in a sticky right column. */}
      <div className="mt-4 grid grid-cols-1 gap-6 sm:mt-6 lg:grid-cols-[1fr_400px] lg:gap-8">
        <div className="lg:col-start-1 lg:row-start-1">
            <div className="flex flex-wrap items-center gap-2">
              <AvailabilityBadge mode={turf.availabilityMode} updatedAt={turf.availabilityUpdatedAt} />
              {turf.isDemo && <DemoBadge />}
              {turf.status === "UNCLAIMED" && <span className="chip border-sky-200 bg-sky-50 text-sky-700">Unclaimed listing</span>}
            </div>
            <h1 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight sm:mt-3 sm:text-3xl">{turf.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
              {/* DIGIPIN instead of a street address: it pinpoints the turf (about 4 m) and works with India Post. */}
              <span className="flex items-center gap-1"><MapPin size={15} className="shrink-0" /> {turf.locality ?? turf.addressLine}, {turf.city.name} {turf.pincode}</span>
              {digipin && <DigipinChip pin={digipin} />}
              {turf.ratingCount > 0 && <span className="flex items-center gap-1"><Stars value={turf.ratingAvg} /> {turf.ratingAvg.toFixed(1)} ({turf.ratingCount})</span>}
            </div>
            <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto whitespace-nowrap px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&>*]:shrink-0">

              <a href={directionsUrl(turf)} target="_blank" className="btn-ghost btn-sm shrink-0"><Navigation size={14} /> Directions</a>
              {turf.phone && <a href={`tel:${turf.phone}`} className="btn-ghost btn-sm shrink-0"><Phone size={14} /> <span className="sm:hidden">Call</span><span className="hidden sm:inline">{formatPhone(turf.phone)}</span></a>}
              {contactOnly && <a href={mapsUrl} target="_blank" rel="noopener" className="btn-ghost btn-sm shrink-0"><MapPin size={14} /> Google Maps</a>}
              {turf.status === "APPROVED" && turf.ownerId && turf.ownerId !== user?.id && <MessageButton turfId={turf.id} signedIn={Boolean(user)} />}
              <a href={whatsappShare(turfShareText(turf))} target="_blank" className="btn-ghost btn-sm shrink-0"><Share2 size={14} /> Share</a>
              <Link href={`/compare?ids=${turf.id}`} className="btn-ghost btn-sm shrink-0">Compare</Link>
            </div>
            {turf.description && <p className="mt-3 max-w-2xl text-slate-700">{turf.description}</p>}
        </div>

        <aside id="book" className="scroll-mt-20 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-fit">
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
              {/* Owner options only on the owner side; players never see them. */}
              {turf.status === "UNCLAIMED" && view === "owner" && (
                <Link href={`/owner/claim?q=${encodeURIComponent(turf.name)}`} className="btn-dark w-full">This is my turf: manage it</Link>
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

        <div className="space-y-8 lg:col-start-1 lg:row-start-2">

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
      </div>
      {contactOnly && (
        // Phones: the two things a player does with a contact-only turf, always within thumb reach.
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
          <div className="flex gap-2 p-3">
            {turf.phone ? (
              <a href={`tel:${turf.phone}`} className="btn-primary flex-1 py-3 text-base"><Phone size={18} /> Call</a>
            ) : (
              <a href={mapsUrl} target="_blank" rel="noopener" className="btn-primary flex-1 py-3 text-base"><MapPin size={18} /> Google Maps</a>
            )}
            <a href={directionsUrl(turf)} target="_blank" className="btn-ghost flex-1 py-3 text-base"><Navigation size={18} /> Directions</a>
          </div>
        </div>
      )}
    </div>
  );
}

