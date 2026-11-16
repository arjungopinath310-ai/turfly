import { business } from "@/lib/business";
import { H, LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Contact · Turfly" };

export default function Contact() {
  const b = business();
  return (
    <LegalPage title="Contact us">
      <p>We&apos;re happy to help with bookings, payments, refunds, listing your turf, or anything else.</p>
      <ul className="list-disc space-y-1 pl-5">
        <li><b>Email:</b> {b.email}</li>
        {b.phone && <li><b>Phone / WhatsApp:</b> {b.phone}</li>}
        <li><b>Address:</b> {b.legalName}, {b.address}</li>
      </ul>
      <H>Booking problems</H>
      <p>For a specific booking, open it in <b>My bookings</b> and use <b>Report a problem</b>, or message the turf directly from the booking page.</p>
      <H>Grievance Officer</H>
      <p>{b.grievanceName} · {b.grievanceEmail}</p>
    </LegalPage>
  );
}
