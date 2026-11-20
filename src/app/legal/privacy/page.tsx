import Link from "next/link";
import { business } from "@/lib/business";
import { H, LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Privacy policy · Turfly" };

export default function Privacy() {
  const b = business();
  return (
    <LegalPage title="Privacy policy">
      <p>This policy explains what personal data {b.legalName} (“we”) collects through {b.brand}, why, and your choices. We follow India’s Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000 and its rules.</p>
      <H>What we collect</H>
      <ul className="list-disc space-y-1 pl-5">
        <li><b>Account:</b> mobile number, and optionally your name, email, preferred position and profile choices.</li>
        <li><b>Bookings and payments:</b> turf, date, time, amounts, booking ID, payment and refund status. Card/UPI details are handled by Razorpay, not stored by us.</li>
        <li><b>Teams:</b> team names, logos and the details you enter for players (name, and optionally phone, email, position, jersey number, photo).</li>
        <li><b>Messages:</b> chats between you and turfs, and Find Players requests.</li>
        <li><b>Location:</b> only if you allow it on your phone or browser, to show the turfs nearest to you. Your approximate position (to about 100 metres) is kept on your device and sent with your requests only to sort turfs by distance; it is not saved to your account. To list turfs in your area we may look up public map data (OpenStreetMap) for the roughly 10 km square you are in; only that square, never your position, is sent. You can turn location off at any time in your phone&apos;s settings.</li>
        <li><b>Device:</b> a push-notification token if you allow notifications in the app; basic technical logs (IP address, browser/app version) for security and abuse prevention.</li>
      </ul>
      <H>Why we use it</H>
      <p>To create your account and sign you in, process bookings and refunds, send confirmations and reminders (in-app, SMS, WhatsApp, email or push), let turf owners manage bookings, prevent fraud and abuse, comply with law (including tax and accounting record-keeping), and improve the service.</p>
      <H>Who we share it with</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>The <b>turf owner</b> of your booking: your name, team, booking details and, for bookings, your phone number so they can contact you about the booking.</li>
        <li><b>Teammates:</b> only names, unless a player chooses to share their phone number with teammates in their profile.</li>
        <li><b>Service providers:</b> Razorpay (payments), MSG91 (SMS), Meta WhatsApp (messages), Resend (email), Google Firebase (push notifications), and our hosting providers, each only for their task.</li>
        <li><b>Authorities</b> when required by law.</li>
      </ul>
      <p>We do not sell your personal data.</p>
      <H>How long we keep it</H>
      <p>Account data is kept while your account is active. When you delete your account we erase your name, phone, email, photo, device tokens and team-member details. Booking and payment records are kept for up to 8 years as required by Indian tax and accounting law, without your contact details.</p>
      <H>Your rights</H>
      <ul className="list-disc space-y-1 pl-5">
        <li><b>Access and correction:</b> view and edit your details in Profile; download a copy of your data from Profile → “Download my data”.</li>
        <li><b>Deletion:</b> delete your account from Profile, or see <Link href="/account/delete" className="underline">how to delete your account</Link>.</li>
        <li><b>Withdraw consent</b> for optional uses (phone sharing, notifications, location) at any time in the app or your phone settings.</li>
      </ul>
      <H>Security</H>
      <p>Data is encrypted in transit (HTTPS). Sign-in codes are hashed and expire after 5 minutes; access to admin tools is restricted and logged.</p>
      <H>Children</H>
      <p>{b.brand} is not intended for children under 18 without a parent or guardian, who should create the account and make bookings.</p>
      <H>Grievance Officer</H>
      <p>{b.grievanceName}, {b.grievanceEmail}, {b.address}. We acknowledge complaints within 24 hours and resolve them within 15 days.</p>
      <p>Changes to this policy will be posted here with a new date.</p>
    </LegalPage>
  );
}
