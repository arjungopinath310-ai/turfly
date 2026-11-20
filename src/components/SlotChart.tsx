"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Loader2, Lock, Unlock, X } from "lucide-react";
import { shortTime, slotRange } from "@/lib/time";
import { useSettleAfterAction } from "./ActionForm";

export type ChartRow = { id: string; name: string; slots: { startMinute: number; status: string }[] };
/** Times are minutes from IST midnight of the chart's date (may run past 1440 for late-night slots). */
export type ChartBooking = { id: string; code: string; configId: string; configName: string; start: number; end: number; who: string; held: boolean };
export type ChartBlock = { id: string; configId: string | null; configName: string; start: number; end: number; reason: string; note: string | null; until: string | null };

const CELL: Record<string, string> = {
  available: "bg-brand-100 border-brand-200 hover:bg-brand-200",
  booked: "bg-ink border-ink",
  held: "bg-amber-300 border-amber-400",
  blocked: "bg-slate-400 border-slate-500 bg-[repeating-linear-gradient(135deg,transparent_0_4px,rgba(255,255,255,.25)_4px_8px)]",
  unavailable: "bg-slate-100 border-slate-200 cursor-default",
};
const SELECTED = "bg-volt border-ink ring-2 ring-ink";
const REASONS = [
  ["MAINTENANCE", "Maintenance"],
  ["PRIVATE_EVENT", "Private event"],
  ["HOLIDAY", "Holiday"],
  ["OTHER", "Other"],
] as const;
const reasonLabel = (r: string) => REASONS.find(([k]) => k === r)?.[1] ?? r.toLowerCase();

type Sel =
  | { kind: "free"; row: string; from: number; to: number }
  | { kind: "block"; block: ChartBlock }
  | { kind: "booking"; booking: ChartBooking }
  | null;

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (min: number) => `${pad(Math.floor((min % 1440) / 60))}:${pad(min % 60)}`;

/**
 * The owner's day chart. Tap a free slot to select it, tap another free slot in the same row to stretch the
 * selection, then block it (or start a walk-in booking for it). Tap a blocked slot to unblock it, a booked one to open it.
 * Phones get time-down-the-side (big tap targets); wider screens keep the timeline.
 */
type Result = { ok?: string; error?: string } | null;
export type BlockInput = { configId: string | null; date: string; startMinute: number; endMinute: number; reason: string; note?: string };

/** `onBlock` / `onUnblock` are server actions bound to this turf by the page (same as the list's Unblock buttons). */
export function SlotChart({ turfId, date, step, rows, bookings, blocks, onBlock, onUnblock }: { turfId: string; date: string; step: number; rows: ChartRow[]; bookings: ChartBooking[]; blocks: ChartBlock[]; onBlock: (input: BlockInput) => Promise<Result>; onUnblock: (blockId: string) => Promise<Result> }) {
  const [sel, setSel] = useState<Sel>(null);
  const [allPitches, setAllPitches] = useState(false);
  const [reason, setReason] = useState<string>("MAINTENANCE");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const settle = useSettleAfterAction();

  const times = useMemo(() => rows[0]?.slots.map((s) => s.startMinute) ?? [], [rows]);
  const status = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) for (const s of r.slots) m.set(`${r.id}:${s.startMinute}`, s.status);
    return m;
  }, [rows]);
  const statusOf = (row: string, t: number) => status.get(`${row}:${t}`) ?? "unavailable";
  const rowName = (id: string) => rows.find((r) => r.id === id)?.name ?? "";

  const covering = <T extends { configId: string | null; start: number; end: number }>(list: T[], row: string, t: number) =>
    list.find((x) => x.start <= t && x.end > t && (x.configId === row || x.configId === null)) ?? list.find((x) => x.start <= t && x.end > t);

  function tap(row: string, t: number) {
    setMsg(null);
    const st = statusOf(row, t);
    if (st === "blocked") {
      const b = covering(blocks, row, t);
      return setSel(b ? { kind: "block", block: b } : null);
    }
    if (st === "booked" || st === "held") {
      const b = covering(bookings, row, t);
      return setSel(b ? { kind: "booking", booking: b } : null);
    }
    if (st !== "available") return;
    if (sel?.kind === "free" && sel.row === row) {
      if (t >= sel.from && t < sel.to) {
        // tapping inside the selection: a single slot clears it, a range ends here
        if (sel.to - sel.from === step) return setSel(null);
        return setSel({ ...sel, to: t + step });
      }
      const from = Math.min(sel.from, t);
      const to = Math.max(sel.to, t + step);
      const allFree = times.filter((x) => x >= from && x < to).every((x) => statusOf(row, x) === "available");
      if (allFree) return setSel({ ...sel, from, to });
    }
    setSel({ kind: "free", row, from: t, to: t + step });
  }

  const isSelected = (row: string, t: number) => sel?.kind === "free" && (sel.row === row || allPitches) && t >= sel.from && t < sel.to;

  // The action re-renders this page on the server, so the chart redraws with the change on its own.
  function done(r: Result) {
    settle();
    setMsg(r);
    if (r?.error) return;
    setSel(null);
    setNote("");
    setShowNote(false);
  }

  function block() {
    if (sel?.kind !== "free") return;
    const input: BlockInput = { configId: allPitches ? null : sel.row, date, startMinute: sel.from, endMinute: sel.to, reason };
    if (note.trim()) input.note = note.trim();
    start(async () => done(await onBlock(input)));
  }
  function removeBlock(b: ChartBlock) {
    if (b.until && !confirm(`This removes the whole block, which runs until ${b.until}. Continue?`)) return;
    start(async () => done(await onUnblock(b.id)));
  }

  const cell = (row: string, t: number, cls?: string) => {
    const st = statusOf(row, t);
    return (
      <button
        key={`${row}:${t}`}
        type="button"
        disabled={st === "unavailable"}
        onClick={() => tap(row, t)}
        title={`${shortTime(t)} · ${st === "available" ? "free" : st}`}
        aria-label={`${rowName(row)} ${shortTime(t)} ${st === "available" ? "free" : st}`}
        aria-pressed={isSelected(row, t)}
        className={clsx("rounded border transition-colors", isSelected(row, t) ? SELECTED : CELL[st] ?? CELL.unavailable, cls)}
      />
    );
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
        {[["bg-brand-100", "Free"], ["bg-ink", "Booked"], ["bg-amber-300", "In checkout"], ["bg-slate-400", "Blocked"], ["bg-slate-100", "Past"]].map(([c, t]) => (
          <span key={t} className="flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-sm ${c}`} /> {t}</span>
        ))}
      </div>
      <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <b>Tap a free slot</b> to block it or add a walk-in. Tap another free slot in the same row to cover a longer time. Tap a grey slot to unblock it.
      </p>

      {/* Phones: times down the side, one column per pitch */}
      <div className="md:hidden">
        <div className="grid gap-1" style={{ gridTemplateColumns: `3.75rem repeat(${rows.length}, minmax(0, 1fr))` }}>
          <div />
          {rows.map((r) => {
            const [main, ...rest] = r.name.split(" · ");
            return (
              <div key={r.id} className="pb-1 text-center leading-tight">
                <div className="truncate text-[11px] font-semibold text-slate-700">{main}</div>
                {rest.length > 0 && <div className="truncate text-[10px] text-slate-400">{rest.join(" · ")}</div>}
              </div>
            );
          })}
          {times.map((t) => (
            <div key={t} className="contents">
              <div className="flex h-9 items-center text-[11px] text-slate-500">{shortTime(t)}</div>
              {rows.map((r) => cell(r.id, t, "h-9"))}
            </div>
          ))}
        </div>
      </div>

      {/* Wider screens: timeline */}
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-[560px] border-separate border-spacing-0.5 text-[11px]">
          <thead>
            <tr>
              <th className="w-32" />
              {times.map((t, i) => (
                <th key={t} className="font-normal text-slate-400">{i % Math.max(1, 60 / step) === 0 ? shortTime(t).replace(" ", " ") : ""}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="pr-2 text-xs font-semibold text-slate-700">{r.name}</td>
                {times.map((t) => <td key={t} className="p-0">{cell(r.id, t, "block h-8 w-full min-w-[16px]")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Rows that share an area show as taken together, e.g. a Full-pitch booking also marks Pitch A and B.</p>
      {sel && <div className="h-44 md:h-28" aria-hidden />}
      {msg?.ok && !sel && <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800" role="status">{msg.ok}</p>}

      {sel && (
        <div className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-2xl md:bottom-6" role="dialog" aria-label="Selected slot">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {sel.kind === "free" && (
                <>
                  <div className="font-semibold">{allPitches ? "All pitches" : rowName(sel.row)} · {slotRange(sel.from, sel.to)}</div>
                  <div className="text-xs text-slate-500">Tap more free slots in this row to make it longer.</div>
                </>
              )}
              {sel.kind === "block" && (
                <>
                  <div className="flex items-center gap-1.5 font-semibold"><Lock size={14} /> Blocked · {slotRange(sel.block.start, sel.block.end)}{sel.block.until ? ` (until ${sel.block.until})` : ""}</div>
                  <div className="text-xs text-slate-500">{sel.block.configName} · {reasonLabel(sel.block.reason)}{sel.block.note ? ` · ${sel.block.note}` : ""}</div>
                </>
              )}
              {sel.kind === "booking" && (
                <>
                  <div className="font-semibold">{sel.booking.who} · {slotRange(sel.booking.start, sel.booking.end)}</div>
                  <div className="text-xs text-slate-500">{sel.booking.configName} · {sel.booking.held ? "a player is paying right now" : sel.booking.code}</div>
                </>
              )}
            </div>
            <button type="button" onClick={() => { setSel(null); setMsg(null); }} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
          </div>

          {sel.kind === "free" && (
            <div className="mt-2.5 space-y-2">
              <div className="flex gap-2">
                <select value={reason} onChange={(e) => setReason(e.target.value)} className="input w-auto min-w-0 flex-1 py-2 text-sm" aria-label="Reason">
                  {REASONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <button type="button" onClick={block} disabled={pending} className="btn-dark shrink-0 px-4">{pending ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />} Block</button>
                <Link
                  prefetch={false}
                  href={`/owner/calendar?${new URLSearchParams({ turf: turfId, date, view: "day", config: sel.row, start: hhmm(sel.from), dur: String(sel.to - sel.from) })}#walkin`}
                  className="btn-ghost shrink-0 px-3"
                  onClick={() => setSel(null)}
                >
                  + Walk-in
                </Link>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-600">
                {rows.length > 1 && <label className="flex items-center gap-1.5"><input type="checkbox" checked={allPitches} onChange={(e) => setAllPitches(e.target.checked)} /> All pitches</label>}
                {!showNote && <button type="button" onClick={() => setShowNote(true)} className="font-medium text-slate-600 underline">Add a note</button>}
              </div>
              {showNote && <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Note (only you see this)" className="input py-2 text-sm" autoFocus />}
            </div>
          )}
          {sel.kind === "block" && (
            <button type="button" onClick={() => removeBlock(sel.block)} disabled={pending} className="btn-ghost mt-3 w-full">{pending ? <Loader2 size={15} className="animate-spin" /> : <Unlock size={15} />} Unblock</button>
          )}
          {sel.kind === "booking" && !sel.booking.held && (
            <Link prefetch={false} href={`/owner/bookings?focus=${sel.booking.id}`} className="btn-ghost mt-3 w-full">Open booking {sel.booking.code}</Link>
          )}
          {msg?.error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg.error}</p>}
        </div>
      )}
    </>
  );
}
