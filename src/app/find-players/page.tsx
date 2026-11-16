import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rupees } from "@/lib/engine/pricing";
import { formatDateLong, formatTimeRange } from "@/lib/time";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";
import { JoinPostButton, RespondButtons } from "@/components/PostButtons";

export default async function FindPlayers({ searchParams }: { searchParams: { city?: string; format?: string } }) {
  const user = await currentUser();
  const city = searchParams.city ?? "manjeri";
  const posts = await prisma.playerPost.findMany({
    where: { status: "OPEN", startAt: { gt: new Date() }, city: { slug: city }, ...(searchParams.format ? { playersPerSide: Number(searchParams.format) } : {}) },
    include: { user: { select: { name: true } }, turf: { select: { name: true, slug: true } }, booking: { select: { endAt: true } }, requests: user ? { where: { userId: user.id } } : false },
    orderBy: { startAt: "asc" },
    take: 50,
  });
  const mine = user
    ? await prisma.playerPost.findMany({
        where: { userId: user.id, startAt: { gt: new Date() } },
        include: { turf: { select: { name: true } }, requests: { include: { user: { select: { name: true, preferredPosition: true } } }, orderBy: { createdAt: "asc" } } },
        orderBy: { startAt: "asc" },
      })
    : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader title="Find players" subtitle="Matches near you that need extra players. Request to join and the organiser confirms.">
        <Link href="/bookings" className="btn-ghost">Post from a booking</Link>
      </PageHeader>
      <form className="mb-5 flex gap-2">
        <input type="hidden" name="city" value={city} />
        {["", "5", "7"].map((f) => (
          <button key={f} name="format" value={f} className={`chip ${String(searchParams.format ?? "") === f ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}>
            {f ? `${f}-a-side` : "All"}
          </button>
        ))}
      </form>

      {mine.length > 0 && (
        <section className="mb-10">
          <h2 className="h2 mb-3">Your posts</h2>
          <div className="space-y-3">
            {mine.map((p) => (
              <div key={p.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Need {p.playersNeeded} · {p.turf?.name} · {formatDateLong(p.startAt)}</div>
                  <StatusBadge status={p.status} />
                </div>
                <ul className="mt-2 divide-y divide-slate-100 text-sm">
                  {p.requests.map((r) => (
                    <li key={r.id} className="flex items-center justify-between py-2">
                      <span>{r.user.name ?? "Player"}{r.user.preferredPosition ? ` · ${r.user.preferredPosition}` : ""}{r.message ? <span className="block text-xs text-slate-500">“{r.message}”</span> : null}</span>
                      {r.status === "PENDING" ? <RespondButtons id={r.id} /> : <StatusBadge status={r.status} />}
                    </li>
                  ))}
                  {p.requests.length === 0 && <li className="py-2 text-slate-500">No requests yet.</li>}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {posts.map((p) => (
          <div key={p.id} className="card space-y-2 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-brand-700">{p.playersPerSide}-a-side</div>
            <div className="text-lg font-bold">Need {p.playersNeeded} more player{p.playersNeeded > 1 ? "s" : ""}</div>
            <div className="text-sm text-slate-600">
              {p.turf ? <Link href={`/turfs/${p.turf.slug}`} className="hover:underline">{p.turf.name}</Link> : "Venue TBA"} · {formatDateLong(p.startAt)}, {formatTimeRange(p.startAt, p.booking?.endAt ?? p.startAt)}
            </div>
            <div className="text-xs text-slate-500">
              Organiser: {p.user.name ?? "Player"}{p.skillLevel ? ` · ${p.skillLevel}` : ""}{p.sharePerPlayer ? ` · ~${rupees(p.sharePerPlayer)} each, paid to organiser at venue` : ""}
            </div>
            {p.note && <p className="text-sm">{p.note}</p>}
            {user ? (
              p.userId === user.id ? <span className="text-xs text-slate-400">Your post</span> : Array.isArray(p.requests) && p.requests[0] ? <StatusBadge status={p.requests[0].status} /> : <JoinPostButton id={p.id} />
            ) : (
              <Link className="btn-ghost btn-sm" href="/login?next=/find-players">Sign in to join</Link>
            )}
          </div>
        ))}
      </div>
      {posts.length === 0 && <Empty title="No open requests right now">Have a booking but short of players? Open it from My bookings and post a request.</Empty>}
    </div>
  );
}
