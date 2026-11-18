"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Loader2, Send } from "lucide-react";

interface Msg { id: string; body: string; at: string; mine: boolean; failed?: boolean }

const time = (at: string) => new Date(at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", day: "numeric", month: "short" });

/** Chat between the organiser and one player. Polls for new messages every few seconds while open. */
export function GameChat({ reqId, initial, otherName, canSend, placeholder }: { reqId: string; initial: Msg[]; otherName: string; canSend: boolean; placeholder?: string }) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const last = msgs.filter((m) => !m.failed && !m.id.startsWith("tmp")).at(-1)?.at;

  const poll = useCallback(async () => {
    if (document.hidden) return;
    const r = await fetch(`/api/player-posts/requests/${reqId}/messages${last ? `?after=${encodeURIComponent(last)}` : ""}`, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const j = (await r.json()) as { messages: Msg[] };
    if (j.messages.length) setMsgs((m) => [...m.filter((x) => !j.messages.some((n) => n.id === x.id)), ...j.messages]);
  }, [reqId, last]);

  useEffect(() => {
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [poll]);
  // Braces matter: newer browsers return a Promise from scrollIntoView, and React would call it as a cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [msgs.length]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setErr(null);
    const tmp: Msg = { id: `tmp${Date.now()}`, body, at: new Date().toISOString(), mine: true };
    setMsgs((m) => [...m, tmp]);
    setText("");
    try {
      const r = await fetch(`/api/player-posts/requests/${reqId}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      // a poll may already have brought the saved copy in
      setMsgs((m) => (m.some((x) => x.id === j.id) ? m.filter((x) => x.id !== tmp.id) : m.map((x) => (x.id === tmp.id ? j : x))));
    } catch (e) {
      setMsgs((m) => m.map((x) => (x.id === tmp.id ? { ...x, failed: true } : x)));
      setErr((e as Error).message);
      setText(body);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
      <div className="max-h-[50vh] min-h-[120px] space-y-1.5 overflow-y-auto p-3">
        {msgs.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No messages yet. Say hi to {otherName}.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={clsx("flex", m.mine ? "justify-end" : "justify-start")}>
            <div className={clsx("max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm shadow-sm", m.mine ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-white text-slate-800", m.failed && "!bg-red-100 !text-red-800")}>
              {m.body}
              <div className={clsx("mt-0.5 text-right text-[10px]", m.mine && !m.failed ? "text-white/70" : "text-slate-400")}>{m.failed ? "Not sent" : time(m.at)}</div>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      {canSend ? (
        <form className="flex items-end gap-2 border-t border-slate-200 bg-white p-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea className="input min-h-[44px] flex-1 resize-none py-2.5" rows={1} maxLength={1000} placeholder={placeholder ?? `Message ${otherName}`} value={text}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} aria-label={`Message ${otherName}`} />
          <button className="btn-primary h-11 w-11 shrink-0 p-0" disabled={!text.trim() || sending} aria-label="Send">
            {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </form>
      ) : (
        <p className="border-t border-slate-200 bg-white p-3 text-center text-xs text-slate-500">This chat is closed.</p>
      )}
      {err && <p className="bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}
    </div>
  );
}
