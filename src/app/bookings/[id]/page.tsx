import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarPlus, Download, MessageCircle, Navigation, Receipt } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rupees } from "@/lib/engine/pricing";
import { describePolicy, parsePolicy } from "@/lib/engine/policy";
import { bookingShareText, directionsUrl, googleCalendarUrl, whatsappShare } from "@/lib/share";
import { formatDateLong, formatIst, formatTimeRange } from "@/lib/time";
import { StatusBadge } from "@/components/ui";
import { RosterEditor } from "@/components/RosterEditor";
import { BookingActions } from "@/components/BookingActions";
import { MessageButton } from "@/components/MessageButton";
import { DigipinChip } from "@/components/DigipinChip";
import { encodeDigipin, formatDigipin } from "@/lib/digipin";

export default async function BookingPage(
  props: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/bookings/${params.id}`);
  const b = await prisma.booking.findUnique({
    where: { id: params.id },
    include: {
      turf: { include: { city: true } },
      config: true,
      team: { include: { members: { where: { status: { not: "REMOVED" } }, orderBy: { createdAt: "asc" } } } },
      roster: true,
      payments: { include: { refunds: true }, orderBy: { createdAt: "asc" } },
      review: true,
      disputes: true,
      split: { include: { shares: { orderBy: { seq: "asc" }, include: { paidBy: { select: { name: true } } } } } },
    },
  });
  if (!b || b.userId !== user.id) notFound();
  if (b.status === "HELD") redirect(`/checkout/${b.id}`);
  const game = await prisma.playerPost.findFirst({
    where: { bookingId: b.id, status: { in: ["OPEN", "FILLED", "CLOSED"] } },
    orderBy: { createdAt: "desc" },
    include: { requests: { where: { status: { in: ["PENDING", "ACCEPTED"] } }, select: { status: true } } },
  });
  const policy = parsePolicy(b.policySnapshot);
  const played = b.status === "COMPLETED" || (b.status === "CONFIRMED" && b.endAt < new Date());
  const share = bookingShareText({ ...b, turfName: b.turf.name, configName: b.config.name, teamName: b.teamName || b.team?.name, lat: b.turf.lat, lng: b.turf.lng });
  const digipin = encodeDigipin(b.turf.lat, b.turf.lng);
  // Area, town and DIGIPIN instead of a street address (calendar entries get the same text).
  const address = `${b.turf.locality ?? b.turf.addressLine}, ${b.turf.city.name} ${b.turf.pincode}${digipin ? ` · DIGIPIN ${formatDigipin(digipin)}` : ""}`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {searchParams.new && b.status === "CONFIRMED" && (
        <div className="mb-6 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-800 p-6 text-white">
          <div className="text-sm opacity-80">Payment verified ✓</div>
          <div className="text-2xl font-bold">You&apos;re booked! See you on the pitch.</div>
          <div className="mt-1 text-sm opacity-90">Confirmation sent via in-app notification{user.phone ? ", SMS/WhatsApp" : ""}{user.email ? " and email" : ""} where configured.</div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-slate-500">Booking ID {b.code}</span>
              <StatusBadge status={b.status} />
            </div>
            <h1 className="mt-2 text-2xl font-bold">{b.turf.name}</h1>
            <p className="text-sm text-slate-600">{b.turf.locality ?? b.turf.addressLine}, {b.turf.city.name} {b.turf.pincode}</p>
            {digipin && <DigipinChip pin={digipin} className="mt-1.5" />}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Info k="Date" v={formatDateLong(b.startAt)} />
              <Info k="Time" v={formatTimeRange(b.startAt, b.endAt)} />
              <Info k="Pitch" v={b.config.name} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <a className="btn-ghost btn-sm" href={directionsUrl(b.turf)} target="_blank"><Navigation size={14} /> Directions</a>
              <a className="btn-ghost btn-sm" target="_blank" href={googleCalendarUrl({ ...b, turfName: b.turf.name, configName: b.config.name, address })}><CalendarPlus size={14} /> Google Calendar</a>
              <a className="btn-ghost btn-sm" href={`/api/bookings/${b.id}/ics`}><Download size={14} /> Calendar file</a>
              <a className="btn-ghost btn-sm" href={whatsappShare(share)} target="_blank"><MessageCircle size={14} /> Share on WhatsApp</a>
              {b.turf.ownerId && b.turf.status === "APPROVED" && <MessageButton turfId={b.turfId} bookingId={b.id} label="Message the turf" />}
            </div>
          </div>

          {["CONFIRMED", "COMPLETED"].includes(b.status) && (
            <RosterEditor
              bookingId={b.id}
              editable={b.status === "CONFIRMED" && !played}
              teamName={b.teamName || b.team?.name || ""}
              teamMembers={(b.team?.members ?? []).map((m) => ({ id: m.id, name: m.name }))}
              players={b.roster.map((r) => ({ id: r.id, teamMemberId: r.teamMemberId, name: r.name, status: r.status, isCaptain: r.isCaptain, isSubstitute: r.isSubstitute }))}
              inviteText={share}
              playersPerSide={b.config.playersPerSide}
            />
          )}

          {/* Split payments are off: online money is Turfly's booking fee only; the turf's price is paid at the turf. */}

          <BookingActions
            bookingId={b.id}
            canCancel={b.status === "CONFIRMED" && b.startAt > new Date()}
            canReview={played && !b.review}
            reviewed={Boolean(b.review)}
            canDispute={["CONFIRMED", "COMPLETED", "CANCELLED"].includes(b.status) && !b.disputes.some((d) => d.status === "OPEN")}
            canPost={b.status === "CONFIRMED" && !played}
            playersPerSide={b.config.playersPerSide}
            game={game && {
              id: game.id,
              status: game.status,
              playersNeeded: game.playersNeeded,
              joined: game.requests.filter((r) => r.status === "ACCEPTED").length,
              asking: game.requests.filter((r) => r.status === "PENDING").length,
            }}
          />
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <h2 className="h2 mb-3 flex items-center gap-2"><Receipt size={18} /> Payment</h2>
            <dl className="space-y-1.5 text-sm">
              <Row k="Turf booking" v={rupees(b.totalPrice)} />
              {b.discount > 0 && <Row k="Discount" v={`− ${rupees(b.discount)}`} />}
              <Row k="Turfly booking fee (online)" v={rupees(b.onlineAmount)} />
              {b.splitCollected > 0 && <Row k="Paid by friends (split)" v={rupees(b.splitCollected)} />}
              {b.platformFee > 0 && <Row k="incl. platform fee" v={rupees(b.platformFee)} />}
              <Row k="Balance at venue" v={b.balanceCollectedAt ? "Paid ✓" : rupees(b.balanceDue)} />
            </dl>
            <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
              {b.payments.filter((p) => p.purpose !== "SPLIT_SHARE").map((p) => (
                <div key={p.id}>
                  <div className="flex justify-between">
                    <span>{p.providerPaymentId ?? p.providerOrderId}{p.method ? ` · ${p.method.toUpperCase()}` : ""}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="text-slate-400">{formatIst(p.createdAt)} · {rupees(p.amount)}</div>
                  {p.refunds.map((r) => (
                    <div key={r.id} className="text-sky-700">Refund {rupees(r.amount)} · {r.status.toLowerCase()}</div>
                  ))}
                </div>
              ))}
            </div>
            <Link href={`/bookings/${b.id}/receipt`} className="btn-ghost btn-sm mt-3 w-full">View receipt</Link>
          </div>
          <div className="card p-5">
            <h2 className="h2 mb-2">Cancellation policy</h2>
            <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600">
              {describePolicy(policy, b.advanceAmount).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

const Info = ({ k, v }: { k: string; v: string }) => (
  <div><div className="label">{k}</div><div className="font-semibold">{v}</div></div>
);
const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between"><dt className="text-slate-600">{k}</dt><dd className="font-medium">{v}</dd></div>
);
