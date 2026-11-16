import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POSITIONS } from "@/lib/brand";
import { PageHeader } from "@/components/ui";
import { formatPhone } from "@/lib/format";

async function save(fd: FormData) {
  "use server";
  const user = await requireUser();
  const d = z
    .object({ name: z.string().trim().min(1).max(60), email: z.string().email().max(120).optional().or(z.literal("")), preferredPosition: z.string().max(30).optional(), share: z.string().optional() })
    .parse(Object.fromEntries(fd));
  if (d.email && d.email !== user.email) {
    const taken = await prisma.user.findFirst({ where: { email: d.email, id: { not: user.id } } });
    if (taken) throw new Error("That email is linked to another account");
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { name: d.name, email: d.email || null, preferredPosition: d.preferredPosition || null, shareContactWithTeams: d.share === "on" },
  });
  // keep the user's own team-member rows in sync with their profile name
  await prisma.teamMember.updateMany({ where: { userId: user.id }, data: { name: d.name } });
  revalidatePath("/", "layout");
  const next = String(fd.get("next") ?? "");
  if (next.startsWith("/") && !next.startsWith("//")) redirect(next);
}

export default async function Profile({ searchParams }: { searchParams: { welcome?: string; next?: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/profile");
  const next = searchParams.next?.startsWith("/") && !searchParams.next.startsWith("//") ? searchParams.next : "";
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <PageHeader title={searchParams.welcome ? "Welcome to Turfly! 👋" : "Your profile"} subtitle={formatPhone(user.phone) ?? user.email ?? ""} />
      {searchParams.welcome && <p className="mb-4 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800">Tell us your name so teammates and turf owners know who booked.</p>}
      <form action={save} className="card space-y-4 p-6">
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="label">Full name</label>
          <input name="name" defaultValue={user.name ?? ""} className="input" required />
        </div>
        <div>
          <label className="label">Email (for receipts)</label>
          <input name="email" type="email" defaultValue={user.email ?? ""} className="input" />
        </div>
        <div>
          <label className="label">Preferred position</label>
          <select name="preferredPosition" defaultValue={user.preferredPosition ?? ""} className="input">
            <option value="">—</option>
            {POSITIONS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm">
          <input type="checkbox" name="share" defaultChecked={user.shareContactWithTeams} className="mt-0.5 accent-brand-600" />
          <span>
            <b>Share my phone number with my teammates</b>
            <span className="block text-slate-500">Off by default. When off, other players only see your name.</span>
          </span>
        </label>
        {user.referralCode && <p className="text-sm text-slate-600">Your referral code: <b className="font-mono">{user.referralCode}</b></p>}
        <button className="btn-primary">{next ? "Save & continue" : "Save"}</button>
      </form>
    </div>
  );
}
