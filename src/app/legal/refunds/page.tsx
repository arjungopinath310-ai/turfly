import { business } from "@/lib/business";
import { describePolicy } from "@/lib/engine/policy";
import { rupees } from "@/lib/engine/pricing";
import { getSettings } from "@/lib/settings";
import { H, LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Cancellation & refund policy · Turfly" };

export default async function Refunds() {
  const b = business();
  const s = await getSettings();
  return (
    <LegalPage title="Cancellation & refund policy">
      <p>To book a slot online you pay {b.brand} a booking fee of {rupees(s.bookingFeePaise)}; the turf&apos;s price is paid at the turf. Each turf can set its own cancellation policy for the booking fee. The exact policy is shown on the turf&apos;s page and again before you pay, and it is saved with your booking. If a turf has not set its own, this default applies:</p>
      <ul className="list-disc space-y-1 pl-5">
        {describePolicy(s.defaultCancellationPolicy, s.bookingFeePaise).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <H>How to cancel</H>
      <p>Open <b>My bookings</b>, choose the booking and tap <b>Check refund &amp; cancel</b>. You will see the exact refund before confirming.</p>
      <H>Refund timelines</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>Refunds go back to the original payment method through Razorpay. UPI refunds usually arrive within 1–3 working days; cards and net banking within 5–7 working days.</li>
        <li>If a payment was taken but the slot could not be confirmed (for example the hold expired and someone else booked it), or you were charged twice, the full amount is refunded automatically.</li>
        <li>The turf&apos;s price is paid at the venue, between you and the turf; the turf refunds it if the match does not take place for reasons on their side.</li>
        <li>Turf coins used on a booking fee come back to your account when the booking is cancelled. Coins have no cash value.</li>
      </ul>
      <H>Turf cancellations</H>
      <p>If the turf cancels or reschedules a booking you don’t accept, you receive a full refund of the booking fee ({rupees(s.bookingFeePaise)}).</p>
      <H>Problems</H>
      <p>Use <b>Report a problem</b> on the booking, or email {b.email}. We aim to resolve disputes within 7 working days.</p>
    </LegalPage>
  );
}
