import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import clsx from "clsx";
import { ChevronLeft, MapPin, MessageCircle, Phone, Users } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rupees } from "@/lib/engine/pricing";
import { threadMessages } from "@/lib/games";
import { dayWord, maxPlayersNeeded, spotsLabel, whatsappLink } from "@/lib/games-shared";
import { formatDateLong, formatTimeRange, relativeTime } from "@/lib/time";
import { GameChat } from "@/components/GameChat";
import { AnswerRequest, GameSettings, JoinGame, LeaveGame } from "@/components/GameActions";

export const metadata: Metadata = { title: "Game" };

const first = (n: string | null | undefined) => n?.trim().split(/\s+/)[0] || "Player";
const REQ_LABEL: Record<string, { text: string; cls: string }> = {
  PENDING: { text: "Waiting", cls: "bg-amber-100 text-amber-800" },
  ACCEPTED: { text: "In the game", cls: "bg-brand-100 text-brand-800" },
  DECLINED: { text: "Declined", cls: "bg-slate-100 text-slate-500" },
  WITHDRAWN: { text: "Left", cls: "bg-slate-100 text-slate-500" },
};

/** One open game: the details, who's playing, and the chat between the organiser and each player who asked. */
export default async function GamePage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ r?: string }> }) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/games/${id}`);
  const post = await prisma.playerPost.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, phone: true, shareContactWithTeams: true } },
      turf: { select: { name: true, slug: true, addressLine: true, city: { select: { name: true } } } },
      booking: { select: { status: true, endAt: true, config: { select: { name: true } } } },
      requests: {
        include: {
          user: { select: { name: true, preferredPosition: true, phone: true, shareContactWithTeams: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, senderId: true, createdAt: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  const isOrganiser = post?.userId === user.id;
  const mine = post?.requests.find((r) => r.userId === user.id) ?? null;
  if (!post || (post.status === "DRAFT" && !isOrganiser)) notFound();

  // Opening the game reads its notifications
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null, link: { startsWith: `/games/${post.id}` } }, data: { readAt: new Date() } });

  const now = new Date();
  const accepted = post.requests.filter((r) => r.status === "ACCEPTED");
  const spots = Math.max(0, post.playersNeeded - accepted.length);
  const started = post.startAt <= now;
  const confirmed = post.booking?.status === "CONFIRMED";
  const joinable = post.status === "OPEN" && confirmed && !started && spots > 0;
  const endAt = post.booking?.endAt ?? post.startAt;
  const org = first(post.user.name);

  const selected = isOrganiser ? post.requests.find((r) => r.id === sp.r) ?? null : mine;
  const thread = selected ? await threadMessages(user, selected.id) : null;
  const chatOpen = !started || now.getTime() - post.startAt.getTime() < 24 * 3600_000;

  const status = !confirmed && post.status !== "DRAFT" ? { text: "Cancelled", cls: "bg-red-100 text-red-700" }
    : post.status === "DRAFT" ? { text: "Waiting for payment", cls: "bg-slate-100 text-slate-600" }
    : started ? { text: "Started", cls: "bg-slate-100 text-slate-600" }
    : post.status === "CLOSED" ? { text: "Not taking players", cls: "bg-slate-100 text-slate-600" }
    : { text: spotsLabel(spots), cls: spots ? "bg-amber-100 text-amber-800" : "bg-brand-100 text-brand-800" };

  const sortOrder = { PENDING: 0, ACCEPTED: 1, DECLINED: 2, WITHDRAWN: 3 } as Record<string, number>;
  const requests = [...post.requests].sort((a, b) => (sortOrder[a.status] ?? 9) - (sortOrder[b.status] ?? 9) || (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0));
  const pending = requests.filter((r) => r.status === "PENDING").length;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-10 pt-4 sm:pt-8">
      <Link href="/games" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-600"><ChevronLeft size={16} /> All games</Link>

      <div className="card overflow-hidden">
        <div className="bg-pitch-night p-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-brand-300">{dayWord(post.startAt)} · {post.playersPerSide}-a-side</div>
              <h1 className="mt-1 whitespace-nowrap text-[22px] font-extrabold sm:text-2xl">{formatTimeRange(post.startAt, endAt)}</h1>
              <div className="text-sm text-slate-300">{formatDateLong(post.startAt)}</div>
            </div>
            <span className={clsx("shrink-0 rounded-full px-3 py-1 text-xs font-bold", status.cls)}>{status.text}</span>
          </div>
          {post.turf && (
            <Link href={`/turfs/${post.turf.slug}`} className="mt-4 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm">
              <MapPin size={16} className="shrink-0 text-brand-300" />
              <span className="min-w-0 truncate"><b>{post.turf.name}</b> · {post.turf.city.name}{post.booking?.config.name ? ` · ${post.booking.config.name}` : ""}</span>
            </Link>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-px bg-slate-100 text-sm">
          <Fact k="Organiser" v={isOrganiser ? "You" : org} />
          <Fact k="Level" v={post.skillLevel ?? "Any level"} />
          <Fact k="Share per player" v={post.sharePerPlayer ? `~${rupees(post.sharePerPlayer)}` : "Ask the organiser"} />
          <Fact k="Players needed" v={`${post.playersNeeded} (${accepted.length} joined)`} />
        </dl>
        {post.note && <p className="border-t border-slate-100 p-4 text-sm">“{post.note}”</p>}
      </div>

      {/* Who's playing (names only) */}
      <section className="mt-4">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700"><Users size={16} /> Who&apos;s joining</h2>
        <div className="flex flex-wrap gap-2">
          <Person name={isOrganiser ? "You" : org} tag="Organiser" />
          {accepted.map((r) => <Person key={r.id} name={r.userId === user.id ? "You" : first(r.user.name)} />)}
          {Array.from({ length: Math.min(spots, 6) }, (_, i) => <span key={i} className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-400">Open spot</span>)}
          {spots > 6 && <span className="px-1 py-1.5 text-xs text-slate-400">+{spots - 6} more</span>}
        </div>
      </section>

      {isOrganiser ? (
        <>
          {post.status === "DRAFT" && (
            <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">Your game goes live for other players as soon as your payment for the booking goes through.</p>
          )}
          <section className="mt-6">
            <h2 className="h2 mb-2">Players asking to join {pending > 0 && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{pending} new</span>}</h2>
            {requests.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">No one yet. We&apos;ll tell you when a player asks, and you can chat with them here.</p>}
            <ul className="space-y-2">
              {requests.map((r) => {
                const open = selected?.id === r.id;
                const label = REQ_LABEL[r.status] ?? REQ_LABEL.PENDING;
                const last = r.messages[0];
                return (
                  <li key={r.id} className={clsx("card overflow-hidden", open && "ring-2 ring-brand-500")}>
                    <Link href={open ? `/games/${post.id}` : `/games/${post.id}?r=${r.id}`} scroll={false} className="flex items-center gap-3 p-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-100 font-bold text-brand-800">{first(r.user.name).slice(0, 1).toUpperCase()}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{r.user.name ?? "Player"}{r.user.preferredPosition ? <span className="font-normal text-slate-500"> · {r.user.preferredPosition}</span> : null}</span>
                        <span className="block truncate text-xs text-slate-500">{last ? `${last.senderId === user.id ? "You: " : ""}${last.body}` : "No messages"}{last ? ` · ${relativeTime(last.createdAt)}` : ""}</span>
                      </span>
                      <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", label.cls)}>{label.text}</span>
                    </Link>
                    {open && thread && (
                      <div className="space-y-3 border-t border-slate-100 p-3">
                        {r.status === "PENDING" && !started && post.status !== "CLOSED" && <AnswerRequest reqId={r.id} name={first(r.user.name)} />}
                        {r.status === "ACCEPTED" && r.user.shareContactWithTeams && r.user.phone && <Contact phone={r.user.phone} name={first(r.user.name)} />}
                        <GameChat reqId={r.id} initial={thread.messages.map((m) => ({ ...m, at: m.at.toISOString() }))} otherName={first(r.user.name)} canSend={chatOpen} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
          {!started && confirmed && (
            <section className="card mt-6 p-4">
              <h2 className="h2 mb-3">Your listing</h2>
              <GameSettings postId={post.id} status={post.status} playersNeeded={post.playersNeeded} accepted={accepted.length} max={maxPlayersNeeded(post.playersPerSide)}
                note={post.note ?? ""} skillLevel={post.skillLevel ?? ""} shareRupees={post.sharePerPlayer != null ? post.sharePerPlayer / 100 : null} />
            </section>
          )}
          {post.bookingId && <Link href={`/bookings/${post.bookingId}`} className="btn-ghost mt-4 w-full">Open the booking</Link>}
        </>
      ) : (
        <section className="mt-6 space-y-3">
          {mine && mine.status !== "WITHDRAWN" ? (
            <>
              <div className={clsx("rounded-2xl p-4 text-sm",
                mine.status === "ACCEPTED" ? "bg-brand-50 text-brand-900" : mine.status === "DECLINED" ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-900")}>
                {mine.status === "ACCEPTED" ? (
                  <><b>You&apos;re in!</b> Be at the turf a few minutes early.{post.sharePerPlayer ? ` Pay your share (~${rupees(post.sharePerPlayer)}) to ${org} at the turf.` : ""}</>
                ) : mine.status === "DECLINED" ? (
                  <>{org} couldn&apos;t fit you in this time. <Link href="/games" className="font-semibold underline">See other games</Link></>
                ) : (
                  <><b>Request sent.</b> {org} will reply here. You can keep chatting meanwhile.</>
                )}
              </div>
              {mine.status === "ACCEPTED" && post.user.shareContactWithTeams && post.user.phone && <Contact phone={post.user.phone} name={org} />}
              {thread && <GameChat reqId={mine.id} initial={thread.messages.map((m) => ({ ...m, at: m.at.toISOString() }))} otherName={org} canSend={chatOpen && mine.status !== "DECLINED"} />}
              {(mine.status === "PENDING" || mine.status === "ACCEPTED") && !started && (
                <div className="text-center"><LeaveGame reqId={mine.id} joined={mine.status === "ACCEPTED"} /></div>
              )}
            </>
          ) : joinable ? (
            <div className="card p-4">
              <h2 className="h2 mb-1">Want to play?</h2>
              <p className="mb-3 text-sm text-slate-600">Ask {org} to join. You can chat to sort out positions and the share; {org} confirms who plays.</p>
              <JoinGame postId={post.id} organiser={org} again={mine?.status === "WITHDRAWN"}
                suggestion={`Hi ${org}, can I join your ${post.playersPerSide}-a-side game?${user.preferredPosition ? ` I usually play ${user.preferredPosition.toLowerCase()}.` : ""}`} />
            </div>
          ) : (
            <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              This game isn&apos;t taking players any more. <Link href="/games" className="font-semibold text-brand-700 underline">See other games</Link>
            </p>
          )}
        </section>
      )}
    </div>
  );
}

const Fact = ({ k, v }: { k: string; v: string }) => (
  <div className="bg-white p-3"><dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{k}</dt><dd className="font-semibold">{v}</dd></div>
);

const Person = ({ name, tag }: { name: string; tag?: string }) => (
  <span className="flex items-center gap-1.5 rounded-full bg-white px-2 py-1 text-sm shadow-sm ring-1 ring-slate-200">
    <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-600 text-[11px] font-bold text-white">{name.slice(0, 1).toUpperCase()}</span>
    {name}{tag && <span className="text-[10px] font-semibold uppercase text-brand-700">{tag}</span>}
  </span>
);

/** Shown only between people in the same game, and only if the other person allows it in their profile. */
const Contact = ({ phone, name }: { phone: string; name: string }) => (
  <div className="flex gap-2">
    <a href={`tel:${phone}`} className="btn-ghost flex-1"><Phone size={16} /> Call {name}</a>
    <a href={whatsappLink(phone)} target="_blank" rel="noopener noreferrer" className="btn-ghost flex-1"><MessageCircle size={16} /> WhatsApp</a>
  </div>
);
