import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POSITIONS } from "@/lib/brand";
import { PageHeader } from "@/components/ui";

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
  revalidatePath("/profile");
}

export default async function Profile() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/profile");
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <PageHeader title="Your profile" subtitle={user.phone ?? user.email ?? ""} />
      <form action={save} className="card space-y-4 p-6">
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
        <button className="btn-primary">Save</button>
      </form>
    </div>
  );
}
