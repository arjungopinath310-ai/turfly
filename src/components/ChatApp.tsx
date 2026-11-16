"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowLeft, CalendarDays, Loader2, MessageCircle, Send } from "lucide-react";

interface ConvRow { id: string; role: "player" | "owner"; title: string; subtitle: string; turfSlug: string; lastMessageAt: string; lastMessageText: string | null; lastFromMe: boolean; unread: number }
interface Msg { id: string; body: string; createdAt: string; mine: boolean; senderLabel: string; pending?: boolean; failed?: boolean }
interface ThreadInfo { id: string; role: "player" | "owner"; title: string; turf: { name: string; slug: string }; booking: { id: string; code: string; startAt: string; endAt: string; status: string } | null; otherLastReadAt: string }

const MAX = 1000;
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return fmtDay(iso);
}

export function ChatApp({ initialId }: { initialId: string | null }) {
  const [list, setList] = useState<ConvRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(initialId);
  const [thread, setThread] = useState<ThreadInfo | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastSeen = useRef<string | null>(null);

  const loadList = useCallback(async () => {
    const r = await fetch("/api/conversations", { cache: "no-store" });
    if (r.ok) setList((await r.json()).conversations);
  }, []);

  useEffect(() => {
    loadList();
    const t = setInterval(loadList, 8000);
    return () => clearInterval(t);
  }, [loadList]);

  // Load a thread when selected
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoadingThread(true);
    setError(null);
    setMessages([]);
    lastSeen.current = null;
    const url = new URL(window.location.href);
    url.searchParams.set("c", selected);
    window.history.replaceState(null, "", url);
    (async () => {
      const r = await fetch(`/api/conversations/${selected}/messages`, { cache: "no-store" });
      const j = await r.json();
      if (cancelled) return;
      setLoadingThread(false);
      if (!r.ok) return setError(j.error ?? "Couldn't open this chat");
      setThread(j.conversation);
      setMessages(j.messages);
      lastSeen.current = j.messages.at(-1)?.createdAt ?? new Date(0).toISOString();
      fetch(`/api/conversations/${selected}/read`, { method: "POST" }).then(loadList);
    })();
    return () => { cancelled = true; };
  }, [selected, loadList]);

  // Poll for new messages in the open thread
  useEffect(() => {
    if (!selected) return;
    const t = setInterval(async () => {
      if (!lastSeen.current) return;
      const r = await fetch(`/api/conversations/${selected}/messages?after=${encodeURIComponent(lastSeen.current)}`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setThread(j.conversation);
      const fresh: Msg[] = j.messages;
      if (fresh.length) {
        lastSeen.current = fresh.at(-1)!.createdAt;
        setMessages((m) => {
          const ids = new Set(m.map((x) => x.id));
          return [...m.filter((x) => !x.pending), ...fresh.filter((x) => !ids.has(x.id))];
        });
        if (fresh.some((x) => !x.mine)) fetch(`/api/conversations/${selected}/read`, { method: "POST" }).then(loadList);
      }
    }, 3000);
    return () => clearInterval(t);
  }, [selected, loadList]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [messages.length, selected]);

  async function send() {
    const body = draft.trim();
    if (!body || !selected) return;
    const temp: Msg = { id: `tmp-${Date.now()}`, body, createdAt: new Date().toISOString(), mine: true, senderLabel: "You", pending: true };
    setMessages((m) => [...m, temp]);
    setDraft("");
    setError(null);
    const r = await fetch(`/api/conversations/${selected}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) });
    const j = await r.json();
    if (!r.ok) {
      setMessages((m) => m.map((x) => (x.id === temp.id ? { ...x, pending: false, failed: true } : x)));
      setError(j.error ?? "Message not sent");
      setDraft(body);
      return;
    }
    // Replace the optimistic bubble; the poll will not duplicate it because ids are de-duplicated
    setMessages((m) => m.map((x) => (x.id === temp.id ? { ...x, id: j.id, createdAt: j.createdAt, pending: false } : x)));
    lastSeen.current = j.createdAt;
    loadList();
  }

  const lastMineSeen = useMemo(() => {
    if (!thread) return null;
    const mine = messages.filter((m) => m.mine && !m.pending && !m.failed);
    const last = mine.at(-1);
    return last && new Date(thread.otherLastReadAt) >= new Date(last.createdAt) ? last.id : null;
  }, [messages, thread]);

  const showThread = Boolean(selected);

  return (
    <div className="card grid grid-cols-1 h-[calc(100vh-11rem)] min-h-[480px] overflow-hidden md:grid-cols-[320px_1fr]">
      {/* Conversation list */}
      <aside className={clsx("flex min-h-0 flex-col border-r border-slate-100", showThread && "hidden md:flex")}>
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Conversations</div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list === null && <div className="p-6 text-center text-sm text-slate-400"><Loader2 className="mx-auto animate-spin" size={18} /></div>}
          {list?.length === 0 && (
            <div className="p-6 text-center text-sm text-slate-500">
              No messages yet. Open a turf and tap <b>Message turf</b> to ask about availability, parking or anything else.
            </div>
          )}
          {list?.map((c) => (
            <button key={c.id} onClick={() => setSelected(c.id)} className={clsx("flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50", selected === c.id && "bg-brand-50/60")}>
              <span className={clsx("grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold", c.role === "player" ? "bg-brand-100 text-brand-800" : "bg-sky-100 text-sky-800")}>
                {c.role === "player" ? "⚽" : c.title.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={clsx("truncate text-sm", c.unread ? "font-bold" : "font-semibold")}>{c.title}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">{ago(c.lastMessageAt)}</span>
                </span>
                <span className="block truncate text-[11px] text-slate-400">{c.subtitle}</span>
                <span className="flex items-center justify-between gap-2">
                  <span className={clsx("truncate text-xs", c.unread ? "text-slate-900" : "text-slate-500")}>{c.lastFromMe ? "You: " : ""}{c.lastMessageText}</span>
                  {c.unread > 0 && <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">{c.unread}</span>}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* Thread */}
      <section className={clsx("flex min-h-0 flex-col", !showThread && "hidden md:flex")}>
        {!selected ? (
          <div className="grid flex-1 place-items-center p-8 text-center text-sm text-slate-500">
            <div><MessageCircle className="mx-auto mb-2 text-slate-300" size={36} />Select a conversation</div>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
              <button className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 md:hidden" onClick={() => setSelected(null)} aria-label="Back"><ArrowLeft size={18} /></button>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{thread?.title ?? "…"}</div>
                <div className="text-xs text-slate-500">
                  {thread?.role === "owner" ? `Player · writing as ${thread.turf.name}` : "Usually replies within a few hours"}
                </div>
              </div>
              {thread && <Link href={`/turfs/${thread.turf.slug}`} className="btn-ghost btn-sm hidden sm:inline-flex">View turf</Link>}
            </header>
            {thread?.booking && (
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">
                <CalendarDays size={14} /> About booking <b className="font-mono">{thread.booking.code}</b> · {fmtDay(thread.booking.startAt)}, {fmtTime(thread.booking.startAt)}–{fmtTime(thread.booking.endAt)}
                {thread.role === "player" && <Link href={`/bookings/${thread.booking.id}`} className="ml-auto underline">Open</Link>}
              </div>
            )}
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-slate-50/60 px-4 py-4">
              {loadingThread && <div className="text-center text-sm text-slate-400"><Loader2 className="mx-auto animate-spin" size={18} /></div>}
              {!loadingThread && messages.length === 0 && !error && (
                <div className="mx-auto max-w-sm rounded-xl bg-white p-4 text-center text-sm text-slate-500 shadow-card">
                  Say hello 👋 Ask about availability, prices, parking or bring-your-own-ball rules.
                </div>
              )}
              {messages.map((m, i) => {
                const newDay = i === 0 || dayKey(messages[i - 1].createdAt) !== dayKey(m.createdAt);
                const grouped = i > 0 && messages[i - 1].mine === m.mine && !newDay;
                return (
                  <div key={m.id}>
                    {newDay && <div className="my-3 text-center text-[11px] font-medium text-slate-400">{fmtDay(m.createdAt)}</div>}
                    <div className={clsx("flex", m.mine ? "justify-end" : "justify-start", !grouped && "mt-2")}>
                      <div className={clsx("max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm", m.mine ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-white text-slate-800", m.failed && "!bg-red-100 !text-red-800")}>
                        {!m.mine && !grouped && <div className="mb-0.5 text-[11px] font-semibold text-brand-700">{m.senderLabel}</div>}
                        <div className="whitespace-pre-wrap break-words">{m.body}</div>
                        <div className={clsx("mt-0.5 text-right text-[10px]", m.mine ? "text-white/70" : "text-slate-400")}>
                          {m.pending ? "Sending…" : m.failed ? "Not sent" : fmtTime(m.createdAt)}
                          {m.id === lastMineSeen && " · Seen"}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            <footer className="border-t border-slate-100 p-3">
              {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{error}</p>}
              <div className="flex items-end gap-2">
                <textarea
                  className="input max-h-36 min-h-[44px] resize-none"
                  rows={1}
                  placeholder="Write a message…"
                  value={draft}
                  maxLength={MAX}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <button className="btn-primary h-11 w-11 shrink-0 !p-0" onClick={send} disabled={!draft.trim()} aria-label="Send"><Send size={17} /></button>
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                <span>Enter to send · Shift+Enter for a new line · Never share OTPs or card details in chat</span>
                {draft.length > MAX - 150 && <span>{draft.length}/{MAX}</span>}
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
