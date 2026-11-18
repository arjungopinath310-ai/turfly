"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, MessageCircle, Minus, Plus, Wallet } from "lucide-react";
import { computeSplit, SPLIT_MAX_PLAYERS, SPLIT_MIN_PLAYERS } from "@/lib/engine/split";
import { whatsappShare } from "@/lib/share";

const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

interface Share { seq: number; status: string; paidByName: string | null; inCheckout: boolean }
interface Props {
  bookingId: string;
  editable: boolean; // confirmed, before the match, balance not yet settled at the venue
  money: { totalPrice: number; discount: number; advanceAmount: number; balanceDue: number; splitCollected: number };
  defaultPlayers: number;
  plan: { token: string; players: number; shareAmount: number; shares: Share[] } | null;
  inviteLine: string; // "football at X on Fri 21 Nov, 7–8 PM"
}

export function SplitPanel(p: Props) {
  const router = useRouter();
  const [players, setPlayers] = useState(p.plan?.players ?? p.defaultPlayers);
  const [editing, setEditing] = useState(!p.plan);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const paid = p.plan?.shares.filter((s) => s.status === "PAID") ?? [];
  const anyPaid = paid.length > 0;
  const preview = computeSplit(p.money, players);

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await fetch(`/api/bookings/${p.bookingId}/split`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ players }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg(j.error);
    setEditing(false);
    router.refresh();
  }

  async function stop() {
    if (!confirm("Stop the split? The link will stop working.")) return;
    setBusy(true);
    const r = await fetch(`/api/bookings/${p.bookingId}/split`, { method: "DELETE" });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg(j.error);
    setEditing(true);
    router.refresh();
  }

  const link = p.plan ? `${origin}/split/${p.plan.token}` : "";
  const message = p.plan ? `Pay your share of ${inr(p.plan.shareAmount)} for ${p.inviteLine} on Turfly: ${link}` : "";

  if (!p.plan && !p.editable) return null;

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2 flex items-center gap-2"><Wallet size={18} /> Split the cost</h2>
        {p.plan && <span className="text-sm text-slate-500">{paid.length} of {p.plan.shares.length} friends paid</span>}
      </div>

      {p.plan && !editing ? (
        <div className="mt-3 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Fact k="Each friend pays" v={inr(p.plan.shareAmount)} />
            <Fact k="Collected online" v={inr(p.money.splitCollected)} />
            <Fact k="You pay at the venue" v={inr(p.money.balanceDue)} />
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={p.plan.shares.length} aria-valuenow={paid.length}>
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(paid.length / p.plan.shares.length) * 100}%` }} />
          </div>
          {p.editable && (
            <div className="space-y-2">
              <label className="label" htmlFor="split-link">Share this link with your friends</label>
              <div className="flex gap-2">
                <input id="split-link" className="input font-mono text-xs" readOnly value={link} onFocus={(e) => e.target.select()} />
                <button className="btn-ghost shrink-0" onClick={async () => { await navigator.clipboard.writeText(link).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                  {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <a className="btn-primary w-full sm:w-auto" href={whatsappShare(message)} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Send on WhatsApp</a>
            </div>
          )}
          <ul className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
            {p.plan.shares.map((s) => (
              <li key={s.seq} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                <span className="text-slate-500">Share {s.seq}</span>
                {s.status === "PAID" ? (
                  <span className="font-medium text-brand-700">{s.paidByName ?? "Paid"} ✓</span>
                ) : s.status === "REFUNDED" ? (
                  <span className="text-sky-700">Refunded</span>
                ) : s.inCheckout ? (
                  <span className="text-amber-700">Being paid…</span>
                ) : (
                  <span className="text-slate-400">Open</span>
                )}
              </li>
            ))}
          </ul>
          {p.editable && !anyPaid && (
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost btn-sm" onClick={() => setEditing(true)} disabled={busy}>Change number of players</button>
              <button className="btn-ghost btn-sm text-red-600" onClick={stop} disabled={busy}>Stop the split</button>
            </div>
          )}
          {anyPaid && p.editable && <p className="text-xs text-slate-500">If the booking is cancelled, every friend gets their share back in full.</p>}
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          <p className="text-sm text-slate-600">
            Friends pay their share online by UPI with one link. What they pay comes off the balance you pay at the venue.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="label !mb-0">Players sharing (including you)</span>
            <div className="flex items-center gap-1">
              <button className="btn-ghost btn-sm" aria-label="Fewer players" onClick={() => setPlayers((n) => Math.max(SPLIT_MIN_PLAYERS, n - 1))}><Minus size={14} /></button>
              <input className="input w-16 text-center" inputMode="numeric" aria-label="Players sharing" value={players}
                onChange={(e) => setPlayers(Math.min(SPLIT_MAX_PLAYERS, Number(e.target.value.replace(/\D/g, "")) || SPLIT_MIN_PLAYERS))} />
              <button className="btn-ghost btn-sm" aria-label="More players" onClick={() => setPlayers((n) => Math.min(SPLIT_MAX_PLAYERS, n + 1))}><Plus size={14} /></button>
            </div>
          </div>
          {preview.ok ? (
            <div className="rounded-xl bg-brand-50 p-4 text-sm text-brand-900">
              <div className="text-lg font-bold">{inr(preview.shareAmount)} each</div>
              <div className="mt-1">
                {preview.friends} friend{preview.friends > 1 ? "s" : ""} pay {inr(preview.friendsTotal)} online. Your share is {inr(preview.organiserShare)}:
                the {inr(p.money.advanceAmount)} you already paid + {inr(preview.organiserAtVenue)} at the venue.
              </div>
            </div>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{preview.error}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={save} disabled={busy || !preview.ok}>
              {busy && <Loader2 size={15} className="animate-spin" />} {p.plan ? "Save" : "Create split link"}
            </button>
            {p.plan && <button className="btn-ghost" onClick={() => { setEditing(false); setPlayers(p.plan!.players); }}>Back</button>}
          </div>
        </div>
      )}
      {msg && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>}
    </div>
  );
}

const Fact = ({ k, v }: { k: string; v: string }) => (
  <div className="rounded-xl border border-slate-100 p-3"><div className="text-xs text-slate-500">{k}</div><div className="text-lg font-bold">{v}</div></div>
);
