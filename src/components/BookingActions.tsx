"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Users } from "lucide-react";
import { rupees } from "@/lib/engine/pricing";
import { maxPlayersNeeded } from "@/lib/games-shared";

const ASPECTS = [
  ["turfQuality", "Turf quality"],
  ["cleanliness", "Cleanliness"],
  ["lighting", "Lighting"],
  ["parking", "Parking"],
  ["overall", "Overall experience"],
] as const;

interface GameLite { id: string; status: string; playersNeeded: number; joined: number; asking: number }

export function BookingActions(p: {
  bookingId: string;
  canCancel: boolean;
  canReview: boolean;
  reviewed: boolean;
  canDispute: boolean;
  canPost: boolean;
  playersPerSide: number;
  game: GameLite | null;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<{ percent: number; amount: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({ turfQuality: 0, cleanliness: 0, lighting: 0, parking: 0, overall: 0 });
  const [comment, setComment] = useState("");
  const [dispute, setDispute] = useState("");
  const [post, setPost] = useState({ playersNeeded: 2, note: "", sharePerPlayer: "" });

  const call = async (url: string, body: unknown, ok: string) => {
    setMsg(null);
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) return setMsg(j.error);
    setMsg(ok);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {p.game ? (
        <Link href={`/games/${p.game.id}`} className="card flex items-center gap-3 p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800"><Users size={20} /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{p.game.status === "CLOSED" ? "Game not taking players" : `Listed for ${p.game.playersNeeded} more player${p.game.playersNeeded === 1 ? "" : "s"}`}</span>
            <span className="block text-sm text-slate-500">
              {p.game.joined} joined{p.game.asking ? ` · ${p.game.asking} asking to join` : ""} · chat and choose who plays
            </span>
          </span>
          <ChevronRight className="text-slate-400" />
        </Link>
      ) : p.canPost ? (
        <details className="card p-5">
          <summary className="cursor-pointer font-semibold">Short of players? List this game</summary>
          <p className="mt-1 text-sm text-slate-600">Players without a team see it, ask to join and chat with you. You choose who plays.</p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="text-sm">
              <span className="label">Players needed</span>
              <input type="number" min={1} max={maxPlayersNeeded(p.playersPerSide)} className="input" value={post.playersNeeded}
                onChange={(e) => setPost({ ...post, playersNeeded: Math.max(1, Math.min(maxPlayersNeeded(p.playersPerSide), Number(e.target.value) || 1)) })} />
            </label>
            <label className="text-sm">
              <span className="label">Share per player ₹</span>
              <input className="input" placeholder="Suggested if empty" inputMode="numeric" value={post.sharePerPlayer} onChange={(e) => setPost({ ...post, sharePerPlayer: e.target.value.replace(/\D/g, "") })} />
            </label>
            <label className="text-sm">
              <span className="label">Note</span>
              <input className="input" placeholder="e.g. need a goalkeeper" value={post.note} onChange={(e) => setPost({ ...post, note: e.target.value })} />
            </label>
          </div>
          <button className="btn-dark mt-3" onClick={() => call("/api/player-posts", { bookingId: p.bookingId, playersNeeded: post.playersNeeded, note: post.note || undefined, sharePerPlayer: post.sharePerPlayer ? Number(post.sharePerPlayer) : undefined }, "Listed! Players can now ask to join.")}>
            List “{post.playersNeeded} player{post.playersNeeded === 1 ? "" : "s"} needed”
          </button>
        </details>
      ) : null}

      {p.canReview && (
        <div className="card space-y-3 p-5">
          <h3 className="h2">Rate your experience</h3>
          {ASPECTS.map(([k, label]) => (
            <div key={k} className="flex items-center justify-between text-sm">
              <span>{label}</span>
              <span className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} className={`text-2xl leading-none ${n <= scores[k] ? "text-amber-500" : "text-slate-300"}`} onClick={() => setScores({ ...scores, [k]: n })} aria-label={`${n} stars`}>★</button>
                ))}
              </span>
            </div>
          ))}
          <textarea className="input" rows={3} placeholder="Anything other players should know?" value={comment} onChange={(e) => setComment(e.target.value)} />
          <button className="btn-primary" disabled={Object.values(scores).some((s) => s === 0)} onClick={() => call("/api/reviews", { bookingId: p.bookingId, ...scores, comment: comment || undefined }, "Thanks for the review!")}>Submit review</button>
        </div>
      )}
      {p.reviewed && <p className="text-sm text-slate-500">You reviewed this booking. Thanks!</p>}

      {p.canCancel && (
        <div className="card p-5">
          <h3 className="h2">Cancel booking</h3>
          {!preview ? (
            <button className="btn-danger mt-3" onClick={async () => setPreview(await (await fetch(`/api/bookings/${p.bookingId}/cancel`)).json())}>
              Check refund & cancel
            </button>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-sm">
                Cancelling now refunds <b>{rupees(preview.amount)}</b> ({preview.percent}%) of what you paid online, as per the policy you accepted.
              </p>
              <div className="flex gap-2">
                <button className="btn-danger" onClick={() => call(`/api/bookings/${p.bookingId}/cancel`, { reason: "Cancelled by customer" }, "Booking cancelled")}>Confirm cancellation</button>
                <button className="btn-ghost" onClick={() => setPreview(null)}>Keep booking</button>
              </div>
            </div>
          )}
        </div>
      )}

      {p.canDispute && (
        <details className="card p-5">
          <summary className="cursor-pointer text-sm font-semibold text-slate-600">Report a problem with this booking</summary>
          <textarea className="input mt-3" rows={3} value={dispute} onChange={(e) => setDispute(e.target.value)} placeholder="What happened? Our team will review it." />
          <button className="btn-ghost mt-2" disabled={dispute.trim().length < 10} onClick={() => call(`/api/bookings/${p.bookingId}/dispute`, { reason: dispute }, "Submitted. We'll get back to you.")}>Submit</button>
        </details>
      )}
      {msg && <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{msg}</p>}
    </div>
  );
}
