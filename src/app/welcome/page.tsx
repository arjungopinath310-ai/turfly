import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { rupees } from "@/lib/engine/pricing";
import { WelcomeSlides } from "@/components/WelcomeSlides";

export const metadata = { title: "Welcome" };

export default async function Welcome() {
  if (await currentUser()) redirect("/");
  return <WelcomeSlides fee={rupees((await getSettings()).bookingFeePaise)} />;
}
