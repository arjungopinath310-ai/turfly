import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

/** Owner pages. Their links live in the top bar (and the phone tab bar) when the owner side is chosen. */
export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/owner&as=owner");
  return <div className="mx-auto max-w-7xl px-4 py-6">{children}</div>;
}
