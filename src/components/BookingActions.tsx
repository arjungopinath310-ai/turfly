"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { rupees } from "@/lib/engine/pricing";

const ASPECTS = [
  ["turfQuality", "Turf quality"],
  ["cleanliness", "Cleanliness"],
  ["lighting", "Lighting"],
  ["parking", "Parking"],
  ["overall", "Overall experience"],
] as const;

export function BookingActions(p: { bookingId: string; canCancel: boolean; canReview: boolean; reviewed: boolean; canDispute: boolean; canPost: boolean }) {
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
      {p.canPost && (
        <details className="card p-5">
          <summary className="cursor-pointer font-semibold">Short of players? Post in Find Players</summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <input type="number" min={1} max={10} className="input" value={post.playersNeeded} onChange={(e) => setPost({ ...post, playersNeeded: Number(e.target.value) })} />
            <input className="input" placeholder="Share per player ₹ (optional)" inputMode="numeric" value={post.sharePerPlayer} onChange={(e) => setPost({ ...post, sharePerPlayer: e.target.value.replace(/\D/g, "") })} />
            <input className="input" placeholder="Note (skill level etc.)" value={post.note} onChange={(e) => setPost({ ...post, note: e.target.value })} />
          </div>
          <button className="btn-dark mt-3" onClick={() => call("/api/player-posts", { bookingId: p.bookingId, playersNeeded: post.playersNeeded, note: post.note || undefined, sharePerPlayer: post.sharePerPlayer ? Number(post.sharePerPlayer) : undefined }, "Posted! Players can now request to join.")}>
            Post “Need {post.playersNeeded} players”
          </button>
        </details>
      )}

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
