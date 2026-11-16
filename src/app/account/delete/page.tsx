import Link from "next/link";
import { business } from "@/lib/business";
import { H, LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Delete your account · Turfly" };

/** Public page required by Google Play: explains how to delete an account and what happens to the data. */
export default function DeleteAccountInfo() {
  const b = business();
  return (
    <LegalPage title="Delete your Turfly account">
      <H>In the app or website</H>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Sign in and open <Link href="/profile" className="underline">Profile</Link> (account menu → Profile).</li>
        <li>Under <b>Your data</b>, tap <b>Delete my account</b>, type DELETE and confirm.</li>
      </ol>
      <p>Cancel any upcoming bookings first. Turf owners should contact us to transfer or close their turf.</p>
      <H>By email</H>
      <p>If you can&apos;t sign in, email {b.email} from the address on your account (or include your registered mobile number). We verify the request and delete the account within 7 days.</p>
      <H>What is deleted</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>Your name, mobile number, email, profile choices and sign-in codes</li>
        <li>Teams you created (and the player contact details you entered), your notifications and app push tokens</li>
        <li>Your name in squads, chats and reviews is replaced with “Deleted user”</li>
      </ul>
      <H>What is kept, and for how long</H>
      <p>Booking, payment and refund records are kept for up to 8 years because Indian tax and accounting law requires it. They are no longer linked to your name or contact details.</p>
    </LegalPage>
  );
}
