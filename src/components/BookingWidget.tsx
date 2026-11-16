"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Loader2, RefreshCw } from "lucide-react";
import { rupees } from "@/lib/engine/pricing";
import { addDays, formatMinute } from "@/lib/time";

type SlotStatus = "available" | "booked" | "held" | "blocked" | "unavailable";
interface Slot { startMinute: number; endMinute: number; status: SlotStatus; price: number; peakLabel: string | null }
interface Config { id: string; name: string; playersPerSide: number; slots: Slot[] }
interface Avail { mode: string; bookable: boolean; updatedAt: string | null; configs: Config[] }
interface QuoteRes {
  quote: { totalPrice: number; discount: number; advanceAmount: number; platformFee: number; onlineAmount: number; balanceDue: number };
  offer: { code: string; title: string } | null;
  policy: { label: string; lines: string[] };
  holdMinutes: number;
}
interface TeamLite { id: string; name: string; playersPerSide: number; members: number }

const STYLE: Record<SlotStatus, string> = {
  available: "border-brand-300 bg-brand-50 text-brand-800 hover:border-brand-500 hover:bg-brand-100",
  booked: "border-red-200 bg-red-50 text-red-400 line-through cursor-not-allowed",
  held: "border-amber-200 bg-amber-50 text-amber-600 cursor-not-allowed",
  blocked: "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed",
  unavailable: "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed",
};

export function BookingWidget(p: { turfId: string; durations: number[]; today: string; maxDays: number; bookable: boolean; signedIn: boolean; advance: number; fullOnline: boolean }) {
  const router = useRouter();
  const days = useMemo(() => Array.from({ length: p.maxDays + 1 }, (_, i) => addDays(p.today, i)), [p.today, p.maxDays]);
  const [date, setDate] = useState(p.today);
  const [duration, setDuration] = useState(p.durations.includes(60) ? 60 : p.durations[0]);
  const [configId, setConfigId] = useState<string | null>(null);
  const [data, setData] = useState<Avail | null>(null);
  const [loading, setLoading] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [quote, setQuote] = useState<QuoteRes | null>(null);
  const [teams, setTeams] = useState<TeamLite[]>([]);
  const [teamId, setTeamId] = useState<string>("");
  const [newTeam, setNewTeam] = useState("");
  const [offerCode, setOfferCode] = useState("");
  const [payFull, setPayFull] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/turfs/${p.turfId}/availability?date=${date}&duration=${duration}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j);
      setConfigId((c) => c ?? j.configs[0]?.id ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [p.turfId, date, duration]);

  useEffect(() => {
    setSlot(null);
    setQuote(null);
    load();
    const t = setInterval(load, 20_000); // near-live refresh
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (p.signedIn) fetch("/api/teams").then((r) => r.json()).then((j) => setTeams(j.teams ?? [])).catch(() => {});
  }, [p.signedIn]);

  const config = data?.configs.find((c) => c.id === configId) ?? null;

  // Selected slot became unavailable on refresh → clear it
  useEffect(() => {
    if (slot && config && config.slots.find((s) => s.startMinute === slot.startMinute)?.status !== "available") {
      setSlot(null);
      setQuote(null);
      setError("That slot was just taken. Please pick another.");
    }
  }, [config, slot]);

  useEffect(() => {
    if (!slot || !configId || !p.bookable) return;
    const ctl = new AbortController();
    fetch(`/api/turfs/${p.turfId}/quote`, {
      method: "POST",
      signal: ctl.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ configId, date, startMinute: slot.startMinute, durationMinutes: duration, offerCode: offerCode || undefined, payFullOnline: payFull }),
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setQuote(j);
        setError(null);
      })
      .catch((e) => e.name !== "AbortError" && setError(e.message));
    return () => ctl.abort();
  }, [slot, configId, date, duration, offerCode, payFull, p.turfId, p.bookable]);

  async function reserve() {
    if (!slot || !configId) return;
    if (!p.signedIn) return router.push(`/login?next=${encodeURIComponent(location.pathname)}`);
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          turfId: p.turfId,
          configId,
          date,
          startMinute: slot.startMinute,
          durationMinutes: duration,
          teamId: teamId && teamId !== "new" ? teamId : null,
          newTeamName: teamId === "new" ? newTeam : null,
          offerCode: offerCode || undefined,
          payFullOnline: payFull,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      router.push(`/checkout/${j.id}`);
    } catch (e) {
      setError((e as Error).message);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  const dayLabel = (d: string) => {
    const dt = new Date(d + "T00:00:00Z");
    return { wd: d === p.today ? "Today" : dt.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" }), dm: dt.getUTCDate() };
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="h2">{p.bookable ? "Book a slot" : "Availability"}</h3>
          {!p.bookable && data && <p className="text-xs text-amber-700">Owner-reported. Call to confirm, online booking not enabled.</p>}
        </div>
        <button onClick={load} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Refresh">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        </button>
      </div>

      <div className="space-y-4 p-5">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {days.map((d) => {
            const l = dayLabel(d);
            return (
              <button key={d} onClick={() => setDate(d)} className={clsx("flex w-14 shrink-0 flex-col items-center rounded-xl border py-2 text-xs", d === date ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white")}>
                <span className="opacity-70">{l.wd}</span>
                <span className="text-base font-bold">{l.dm}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <select className="input" value={configId ?? ""} onChange={(e) => { setConfigId(e.target.value); setSlot(null); }}>
            {data?.configs.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select className="input w-28" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {p.durations.map((d) => (
              <option key={d} value={d}>{d} min</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
          <Legend c="bg-brand-400" t="Available" />
          <Legend c="bg-red-400" t="Booked" />
          <Legend c="bg-amber-400" t="On hold (checkout)" />
          <Legend c="bg-slate-300" t="Unavailable / blocked" />
        </div>

        <div className="grid max-h-72 grid-cols-3 gap-1.5 overflow-y-auto pr-1">
          {config?.slots.map((s) => (
            <button
              key={s.startMinute}
              disabled={s.status !== "available" || !p.bookable}
              onClick={() => { setSlot(s); setError(null); }}
              className={clsx("rounded-lg border px-1 py-2 text-xs font-semibold transition", STYLE[s.status], slot?.startMinute === s.startMinute && "!border-slate-900 !bg-slate-900 !text-white", !p.bookable && s.status === "available" && "cursor-default")}
              title={`${formatMinute(s.startMinute)} – ${formatMinute(s.endMinute)} · ${rupees(s.price)}${s.peakLabel ? ` · ${s.peakLabel}` : ""}`}
            >
              {formatMinute(s.startMinute)}
              <span className="block text-[10px] font-medium opacity-80">{rupees(s.price)}{s.peakLabel ? " ★" : ""}</span>
            </button>
          ))}
          {config && config.slots.length === 0 && <p className="col-span-3 py-6 text-center text-sm text-slate-500">Closed on this day.</p>}
        </div>

        {slot && p.bookable && (
          <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
            <div className="text-sm font-semibold">
              {config?.name} · {formatMinute(slot.startMinute)} – {formatMinute(slot.endMinute)}
            </div>

            <div>
              <label className="label">Team</label>
              <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                <option value="">No team / decide later</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.members} players)</option>
                ))}
                <option value="new">+ Create a new team</option>
              </select>
              {teamId === "new" && <input className="input mt-2" placeholder="Team name" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} maxLength={60} />}
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input className="input uppercase" placeholder="Offer code" value={offerCode} onChange={(e) => setOfferCode(e.target.value.toUpperCase())} />
              {p.fullOnline && (
                <label className="flex items-center gap-1.5 text-xs font-medium">
                  <input type="checkbox" className="accent-brand-600" checked={payFull} onChange={(e) => setPayFull(e.target.checked)} /> Pay full online
                </label>
              )}
            </div>

            {quote && (
              <>
                <dl className="space-y-1.5 text-sm">
                  <Row k="Turf booking" v={rupees(quote.quote.totalPrice)} />
                  {quote.quote.discount > 0 && <Row k={`Offer ${quote.offer?.code ?? ""}`} v={`− ${rupees(quote.quote.discount)}`} className="text-brand-700" />}
                  <Row k={payFull ? "Paid online" : "Online advance"} v={rupees(quote.quote.advanceAmount)} />
                  {quote.quote.platformFee > 0 && <Row k="Platform fee (separate)" v={rupees(quote.quote.platformFee)} />}
                  <Row k="Balance at venue" v={rupees(quote.quote.balanceDue)} />
                  <div className="flex justify-between border-t border-slate-200 pt-2 font-bold">
                    <span>Pay now</span>
                    <span>{rupees(quote.quote.onlineAmount)}</span>
                  </div>
                </dl>
                <details className="text-xs text-slate-600" open>
                  <summary className="cursor-pointer font-semibold text-slate-700">Advance is {quote.policy.label.toLowerCase()}. See how</summary>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {quote.policy.lines.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </details>
              </>
            )}

            <button className="btn-primary w-full py-3 text-base" disabled={submitting || !quote || (teamId === "new" && newTeam.trim().length < 2)} onClick={reserve}>
              {submitting && <Loader2 size={16} className="animate-spin" />}
              {p.signedIn ? `Reserve · pay ${quote ? rupees(quote.quote.onlineAmount) : rupees(p.advance)}` : "Sign in to reserve"}
            </button>
            {quote && <p className="text-center text-[11px] text-slate-500">We hold the slot for {quote.holdMinutes} minutes while you pay.</p>}
          </div>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
}

const Legend = ({ c, t }: { c: string; t: string }) => (
  <span className="flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-sm ${c}`} /> {t}</span>
);
const Row = ({ k, v, className }: { k: string; v: string; className?: string }) => (
  <div className={clsx("flex justify-between", className)}><dt className="text-slate-600">{k}</dt><dd className="font-medium">{v}</dd></div>
);
