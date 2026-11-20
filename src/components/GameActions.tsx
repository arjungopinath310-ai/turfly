"use client";
import { useState } from "react";
import { useRefreshingRouter as useRouter } from "./ActionForm";
import clsx from "clsx";
import { Loader2, Minus, Plus } from "lucide-react";
import { SKILL_LEVELS } from "@/lib/games-shared";

async function post(url: string, body: unknown, method = "POST") {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Something went wrong");
  return j;
}

/** "Ask to join" with a first message to the organiser; the chat opens after sending. */
export function JoinGame({ postId, organiser, suggestion, again }: { postId: string; organiser: string; suggestion: string; again?: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState(suggestion);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <label className="label" htmlFor="join-msg">Message to {organiser}</label>
      <textarea id="join-msg" className="input" rows={3} maxLength={300} value={msg} onChange={(e) => setMsg(e.target.value)} />
      <button className="btn-primary w-full py-3 text-base" disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            await post(`/api/player-posts/${postId}/requests`, { message: msg.trim() || null });
            router.refresh();
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}>
        {busy && <Loader2 size={16} className="animate-spin" />} {again ? "Ask again" : "Ask to join"}
      </button>
      <p className="text-center text-xs text-slate-500">{organiser} sees your name and message, not your phone number.</p>
      {err && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
    </div>
  );
}

/** Player: cancel the request, or leave a game they joined. */
export function LeaveGame({ reqId, joined }: { reqId: string; joined: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button className="btn-ghost btn-sm text-red-700" disabled={busy}
      onClick={async () => {
        if (!confirm(joined ? "Leave this game? The organiser will be told and your spot opens again." : "Cancel your request to join?")) return;
        setBusy(true);
        try {
          await post(`/api/player-posts/requests/${reqId}`, { withdraw: true });
          router.refresh();
        } catch (e) {
          alert((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}>
      {joined ? "Leave game" : "Cancel request"}
    </button>
  );
}

/** Organiser: accept or decline one player. */
export function AnswerRequest({ reqId, name }: { reqId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const send = async (decision: "ACCEPTED" | "DECLINED") => {
    setBusy(decision);
    setErr(null);
    try {
      await post(`/api/player-posts/requests/${reqId}`, { decision });
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div>
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={Boolean(busy)} onClick={() => send("ACCEPTED")}>
          {busy === "ACCEPTED" && <Loader2 size={16} className="animate-spin" />} Accept {name}
        </button>
        <button className="btn-ghost" disabled={Boolean(busy)} onClick={() => send("DECLINED")}>Decline</button>
      </div>
      {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
    </div>
  );
}

/** Organiser: spots needed, level, note and share; close to new players or open again. */
export function GameSettings(p: { postId: string; status: string; playersNeeded: number; accepted: number; max: number; note: string; skillLevel: string; shareRupees: number | null }) {
  const router = useRouter();
  const [need, setNeed] = useState(p.playersNeeded);
  const [note, setNote] = useState(p.note);
  const [skill, setSkill] = useState(p.skillLevel);
  const [share, setShare] = useState(p.shareRupees != null ? String(p.shareRupees) : "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = need !== p.playersNeeded || note !== p.note || skill !== p.skillLevel || share !== (p.shareRupees != null ? String(p.shareRupees) : "");

  const save = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await post(`/api/player-posts/${p.postId}`, body, "PATCH");
      setMsg({ ok: true, text: ok });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const closed = p.status === "CLOSED";
  return (
    <div className="space-y-3">
      {!closed && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Players needed</div>
              <div className="text-xs text-slate-500">{p.accepted} joined so far</div>
            </div>
            <span className="flex items-center gap-2">
              <button type="button" className="grid h-9 w-9 place-items-center rounded-full border border-slate-300 bg-white disabled:opacity-40" onClick={() => setNeed((n) => n - 1)} disabled={need <= Math.max(1, p.accepted)} aria-label="One less"><Minus size={16} /></button>
              <span className="w-6 text-center text-lg font-bold">{need}</span>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-full border border-slate-300 bg-white disabled:opacity-40" onClick={() => setNeed((n) => n + 1)} disabled={need >= p.max} aria-label="One more"><Plus size={16} /></button>
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["", ...SKILL_LEVELS].map((l) => (
              <button key={l} type="button" onClick={() => setSkill(l)} aria-pressed={skill === l}
                className={clsx("rounded-full border px-3 py-1 text-xs", skill === l ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white")}>
                {l || "Any level"}
              </button>
            ))}
          </div>
          <input className="input" placeholder="Note, e.g. need a goalkeeper" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          <label className="flex items-center gap-2 text-sm">
            <span className="shrink-0">Share per player ₹</span>
            <input className="input" inputMode="numeric" placeholder="optional" value={share} onChange={(e) => setShare(e.target.value.replace(/\D/g, "").slice(0, 5))} />
          </label>
          <button className="btn-dark w-full" disabled={!changed || busy}
            onClick={() => save({ playersNeeded: need, note: note || null, skillLevel: skill || null, sharePerPlayer: share ? Number(share) : null }, "Saved")}>
            {busy && <Loader2 size={16} className="animate-spin" />} Save changes
          </button>
        </>
      )}
      <button className={closed ? "btn-primary w-full" : "btn-ghost w-full text-red-700"} disabled={busy}
        onClick={() => {
          if (!closed && !confirm("Stop taking players? People waiting for an answer are told. Players who joined stay in.")) return;
          save({ action: closed ? "reopen" : "close" }, closed ? "Your game is open again" : "Closed to new players");
        }}>
        {closed ? "Open again for players" : "Stop taking players"}
      </button>
      {msg && <p className={clsx("text-sm", msg.ok ? "text-brand-700" : "text-red-700")}>{msg.text}</p>}
    </div>
  );
}
