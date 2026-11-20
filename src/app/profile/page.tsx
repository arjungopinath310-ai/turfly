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
import { coinBalance, coinHistory } from "@/lib/coins";
import { getSettings } from "@/lib/settings";
import { rupees } from "@/lib/engine/pricing";

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
  const settings = await getSettings();
  const coins = { balance: await coinBalance(user.id), history: await coinHistory(user.id), perBooking: settings.coinsPerBooking, valuePaise: settings.coinValuePaise };
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
      {!searchParams.welcome && isPlayer && (
        <section id="coins" className="card mt-6 scroll-mt-20 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="h2">Turf coins</h2>
            <span className="text-2xl font-extrabold text-brand-700">{coins.balance}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Earn {coins.perBooking} coins for every online booking you play. Use them on the booking fee of your next booking: 1 coin = {rupees(coins.valuePaise)}.
            Coins have no cash value and can&apos;t be transferred.
          </p>
          {coins.history.length > 0 && (
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {coins.history.map((e) => (
                <li key={e.id} className="flex justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-slate-700">{e.note ?? e.kind.toLowerCase()}</span>
                  <span className={e.amount > 0 ? "font-semibold text-brand-700" : "font-semibold text-slate-500"}>{e.amount > 0 ? `+${e.amount}` : e.amount}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {!searchParams.welcome && (
        <div className="mt-6">
          <AccountData />
        </div>
      )}
    </div>
  );
}
