import { redirect } from "next/navigation";
import { safeNext } from "@/lib/access";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POSITIONS } from "@/lib/brand";
import { PageHeader } from "@/components/ui";
import { formatPhone } from "@/lib/format";
import { AccountData } from "@/components/AccountData";
import { currentView } from "@/lib/view";

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
  // Player-only fields are only on the form for the player side; the owner side's form must not reset them.
  const playerFields = fd.get("playerFields") === "1" ? { preferredPosition: d.preferredPosition || null, shareContactWithTeams: d.share === "on" } : {};
  await prisma.user.update({ where: { id: user.id }, data: { name: d.name, email: d.email || null, ...playerFields } });
  // keep the user's own team-member rows in sync with their profile name
  await prisma.teamMember.updateMany({ where: { userId: user.id }, data: { name: d.name } });
  revalidatePath("/", "layout");
  const next = String(fd.get("next") ?? "");
  const dest = safeNext(next, "");
  if (dest) redirect(dest);
}

export default async function Profile(props: { searchParams: Promise<{ welcome?: string; next?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await currentUser();
  if (!user) redirect("/login?next=/profile");
  const next = safeNext(searchParams.next, "");
  const isPlayer = (await currentView(user.role)) === "player";
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <PageHeader title={searchParams.welcome ? "Welcome to Turfly! 👋" : "Your profile"} subtitle={formatPhone(user.phone) ?? user.email ?? ""} />
      {searchParams.welcome && (
        <p className="mb-4 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
          {isPlayer ? "Tell us your name so teammates and turf owners know who booked." : "Tell us your name so players and our team know who runs the turf."}
        </p>
      )}
      <form action={save} className="card space-y-4 p-6">
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="label" htmlFor="pf-name">Full name</label>
          <input id="pf-name" name="name" defaultValue={user.name ?? ""} className="input" autoComplete="name" required />
        </div>
        <div>
          <label className="label" htmlFor="pf-email">Email (for receipts)</label>
          <input id="pf-email" name="email" type="email" defaultValue={user.email ?? ""} className="input" autoComplete="email" />
        </div>
        {isPlayer && (
          <>
            <input type="hidden" name="playerFields" value="1" />
            <div>
              <label className="label" htmlFor="pf-position">Preferred position</label>
              <select id="pf-position" name="preferredPosition" defaultValue={user.preferredPosition ?? ""} className="input">
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
          </>
        )}
        <button className="btn-primary">{next ? "Save & continue" : "Save"}</button>
      </form>
      {!searchParams.welcome && (
        <div className="mt-6">
          <AccountData />
        </div>
      )}
    </div>
  );
}
