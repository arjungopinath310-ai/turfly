import Link from "next/link";
import { business } from "@/lib/business";
import { rupees } from "@/lib/engine/pricing";
import { getSettings } from "@/lib/settings";
import { H, LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Terms of use · Turfly" };

export default async function Terms() {
  const b = business();
  const s = await getSettings();
  return (
    <LegalPage title="Terms of use">
      <p>These terms govern your use of {b.brand} (the website and mobile apps), operated by {b.legalName}, {b.address} (“we”, “us”). By creating an account or making a booking you agree to them.</p>
      <H>1. What {b.brand} does</H>
      <p>{b.brand} is a marketplace that lets players discover football turfs, reserve time slots and organise teams, and lets turf owners manage their bookings. The turf itself is operated by its owner, who is responsible for the venue, its safety and the service provided at the venue.</p>
      <H>2. Accounts</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>You sign in with a mobile number verified by OTP (or Google). Keep your phone and codes private; you are responsible for activity on your account.</li>
        <li>You must be at least 18 years old to make payments. Players under 18 may play only with a parent or guardian’s consent, who makes the booking.</li>
        <li>We may suspend accounts used for fraud, abuse, spam or breaking these terms.</li>
      </ul>
      <H>3. Bookings and payments</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>{b.brand} is free to use. To book a slot online you pay {b.brand} a booking fee (currently {rupees(s.bookingFeePaise)} per booking); the slot is reserved once our payment partner confirms it. The turf&apos;s price is paid to the turf at the venue.</li>
        <li>The turf&apos;s price, the booking fee and the cancellation policy are shown before you pay. The policy shown at the time of booking applies to that booking.</li>
        <li>Turf coins are a loyalty reward: earned on bookings you play, usable only on {b.brand}&apos;s booking fee, with no cash value; they cannot be bought, sold or transferred.</li>
        <li>Payments are processed by Razorpay. We never store your card or UPI details.</li>
        <li>Turf owners may cancel for reasons such as weather, maintenance or safety; you then receive a full refund of what you paid online.</li>
      </ul>
      <H>4. Your conduct</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>Follow the turf’s rules, arrive on time and respect staff, other players and property. Damage caused by your group may be charged by the turf.</li>
        <li>Do not use chat or player posts to harass, spam, share others’ personal data without consent, or arrange payments outside {b.brand} to avoid policies.</li>
        <li>Reviews must reflect a genuine experience; we may remove fake or abusive reviews.</li>
      </ul>
      <H>5. Turf owners</H>
      <p>Owners must have the right to list the turf, keep their calendar accurate (including walk-in and phone bookings when using live availability), honour confirmed bookings, and follow the cancellation policy they publish. Listing a turf and managing bookings on {b.brand} is free for owners and managers; {b.brand} earns only the booking fee players pay to book online.</p>
      <H>6. Liability</H>
      <p>Football carries a risk of injury; you play at your own risk. To the extent permitted by law, we are not liable for injuries, loss or damage at the venue, or for indirect losses. Our total liability for a booking is limited to the amount you paid us online for it.</p>
      <H>7. Changes and law</H>
      <p>We may update these terms; we will show the new date above and, for significant changes, notify you in the app. These terms are governed by the laws of India, with courts at {b.city} having jurisdiction.</p>
      <H>8. Contact</H>
      <p>Questions or complaints: {b.email}{b.phone ? `, ${b.phone}` : ""}. See also our <Link href="/legal/privacy" className="underline">privacy policy</Link> and <Link href="/legal/refunds" className="underline">cancellation &amp; refund policy</Link>.</p>
    </LegalPage>
  );
}
