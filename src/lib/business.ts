import { BRAND } from "./brand";

/** Business identity used on legal pages, receipts and the app store listing. Set these in .env before launch. */
export function business() {
  const v = (k: string, fallback: string) => process.env[k]?.trim() || fallback;
  return {
    brand: BRAND.name,
    legalName: v("BUSINESS_NAME", "[Business legal name, set BUSINESS_NAME]"),
    address: v("BUSINESS_ADDRESS", "[Registered address, set BUSINESS_ADDRESS]"),
    email: v("SUPPORT_EMAIL", "[support email, set SUPPORT_EMAIL]"),
    phone: v("SUPPORT_PHONE", ""),
    grievanceName: v("GRIEVANCE_OFFICER_NAME", "[Grievance Officer name, set GRIEVANCE_OFFICER_NAME]"),
    grievanceEmail: v("GRIEVANCE_OFFICER_EMAIL", v("SUPPORT_EMAIL", "[grievance email]")),
    city: v("BUSINESS_CITY", "Manjeri, Kerala"),
    updated: v("LEGAL_LAST_UPDATED", "16 November 2026"),
    configured: Boolean(process.env.BUSINESS_NAME && process.env.BUSINESS_ADDRESS && process.env.SUPPORT_EMAIL),
  };
}
