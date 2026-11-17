"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Loader2, RefreshCw } from "lucide-react";
import { rupees } from "@/lib/engine/pricing";
import { addDays, formatMinute, slotRange } from "@/lib/time";

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

const TAKEN: Partial<Record<SlotStatus, string>> = { booked: "Booked", held: "On hold", blocked: "Closed" };
// Grouping long days into parts makes the right time easy to find with a thumb.
const PARTS = [
  { label: "Morning", until: 12 * 60 },
  { label: "Afternoon", until: 17 * 60 },
  { label: "Evening", until: 21 * 60 },
  { label: "Night", until: Infinity },
];
const durationLabel = (d: number) => (d < 60 ? `${d} min` : `${d / 60} hr`);

/**
 * Slot picker, built on what makes booking apps convert: the date strip on top, pitch and duration as big buttons,
 * every slot showing its start–end time and price (no mental maths), taken slots greyed, a running summary,
 * and (on phones) a bar at the bottom with the amount to pay and the button to continue.
 */
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
  const [showOffer, setShowOffer] = useState(false);
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
      setConfigId((c) => (c && j.configs.some((x: Config) => x.id === c) ? c : j.configs[0]?.id ?? null));
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
  // Past and closed times are left out; taken ones stay visible (greyed) so players see what's busy.
  const shown = useMemo(() => (config?.slots ?? []).filter((s) => s.status !== "unavailable"), [config]);
  const free = shown.filter((s) => s.status === "available");
  const fromPrice = free.length ? Math.min(...free.map((s) => s.price)) : null;

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
    return {
      wd: d === p.today ? "Today" : d === addDays(p.today, 1) ? "Tmrw" : dt.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" }),
      dm: dt.getUTCDate(),
      mon: dt.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }),
    };
  };
  const pick = (s: Slot) => {
    setSlot(s);
    setError(null);
  };
  const canContinue = Boolean(slot && quote && !submitting && !(teamId === "new" && newTeam.trim().length < 2));
  const payNow = quote ? rupees(quote.quote.onlineAmount) : rupees(p.advance);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 sm:px-5">
        <div>
          <h2 className="text-lg font-bold">{p.bookable ? "Book a slot" : "Availability"}</h2>
          {!p.bookable && data && <p className="text-xs text-amber-700">Owner-reported. Call to confirm; online booking isn&apos;t on.</p>}
        </div>
        <button onClick={load} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Refresh availability">
          {loading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
        </button>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {/* 1. Day */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-5 sm:px-5">
          {days.map((d) => {
            const l = dayLabel(d);
            const on = d === date;
            return (
              <button key={d} onClick={() => setDate(d)} aria-pressed={on}
                className={clsx("flex w-[58px] shrink-0 flex-col items-center rounded-2xl border py-2 transition", on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700")}>
                <span className="text-[11px] font-medium opacity-75">{l.wd}</span>
                <span className="text-lg font-bold leading-tight">{l.dm}</span>
                <span className="text-[10px] opacity-60">{l.mon}</span>
              </button>
            );
          })}
        </div>

        {/* 2. Pitch and length */}
        {data && data.configs.length > 1 && (
          <div>
            <div className="label">Pitch</div>
            <div className="flex flex-wrap gap-2">
              {data.configs.map((c) => (
                <button key={c.id} onClick={() => { setConfigId(c.id); setSlot(null); }} aria-pressed={c.id === configId}
                  className={clsx("rounded-xl border px-3 py-2 text-left text-sm", c.id === configId ? "border-brand-600 bg-brand-50 font-semibold text-brand-800" : "border-slate-200 bg-white")}>
                  {c.name}{!/a-side/i.test(c.name) && <span className="text-xs text-slate-500"> · {c.playersPerSide}-a-side</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        {p.durations.length > 1 && (
          <div>
            <div className="label">How long</div>
            <div className="flex gap-2">
              {p.durations.map((d) => (
                <button key={d} onClick={() => setDuration(d)} aria-pressed={d === duration}
                  className={clsx("min-w-[64px] rounded-xl border px-3 py-2 text-sm", d === duration ? "border-brand-600 bg-brand-50 font-semibold text-brand-800" : "border-slate-200 bg-white")}>
                  {durationLabel(d)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 3. Time */}
        <div id="slots" className="scroll-mt-24 space-y-3">
          {!data && <div className="grid grid-cols-3 gap-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}</div>}
          {data && PARTS.map((part, i) => {
            const from = i === 0 ? -Infinity : PARTS[i - 1].until;
            // startMinute can pass 1440 for late-night slots after midnight; those stay under "Night".
            const list = shown.filter((s) => s.startMinute >= from && s.startMinute < part.until);
            if (!list.length) return null;
            return (
              <div key={part.label}>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{part.label}</div>
                <div className="grid grid-cols-3 gap-2">
                  {list.map((s) => {
                    const on = slot?.startMinute === s.startMinute;
                    const ok = s.status === "available" && p.bookable;
                    return (
                      <button key={s.startMinute} disabled={!ok} onClick={() => pick(s)} aria-pressed={on}
                        title={`${formatMinute(s.startMinute)} – ${formatMinute(s.endMinute)}${s.peakLabel ? ` · ${s.peakLabel}` : ""}`}
                        className={clsx("rounded-xl border px-1 py-2.5 text-center transition",
                          on ? "border-slate-900 bg-slate-900 text-white" :
                          s.status === "available" ? "border-brand-200 bg-white text-slate-900 active:bg-brand-50 enabled:hover:border-brand-500" :
                          "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400")}>
                        <span className="block text-[13px] font-semibold leading-tight">{slotRange(s.startMinute, s.endMinute)}</span>
                        <span className={clsx("block text-[11px]", on ? "text-white/80" : s.status === "available" ? "text-brand-700" : "")}>
                          {s.status === "available" ? `${rupees(s.price)}${s.peakLabel ? " · peak" : ""}` : TAKEN[s.status] ?? "Taken"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {data && config && free.length === 0 && (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm">
              <div className="font-semibold">{shown.length ? "Fully booked" : "No times left"} on {dayLabel(date).wd === "Today" ? "today" : `${dayLabel(date).wd} ${dayLabel(date).dm}`}.</div>
              <div className="mt-1 text-slate-600">
                Try another day above, or{" "}
                <a href={`/turfs?bookable=1&date=${date}`} className="font-semibold text-brand-700 underline">see other turfs</a>.
              </div>
            </div>
          )}
        </div>

        {/* 4. Summary */}
        {slot && p.bookable && (
          <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your slot</div>
              <div className="font-semibold">
                {dayLabel(date).wd === "Today" ? "Today" : `${dayLabel(date).wd} ${dayLabel(date).dm} ${dayLabel(date).mon}`} · {formatMinute(slot.startMinute)} – {formatMinute(slot.endMinute)}
              </div>
              <div className="text-sm text-slate-600">{config?.name}</div>
            </div>

            <div>
              <label className="label" htmlFor="team">Team (optional)</label>
              <select id="team" className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                <option value="">No team / decide later</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.members} players)</option>
                ))}
                <option value="new">+ Create a new team</option>
              </select>
              {teamId === "new" && <input className="input mt-2" placeholder="Team name" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} maxLength={60} />}
            </div>

            {showOffer || offerCode ? (
              <input className="input uppercase" placeholder="Offer code" value={offerCode} onChange={(e) => setOfferCode(e.target.value.toUpperCase())} autoFocus={showOffer && !offerCode} />
            ) : (
              <button className="text-sm font-semibold text-brand-700" onClick={() => setShowOffer(true)}>Have an offer code?</button>
            )}
            {p.fullOnline && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={payFull} onChange={(e) => setPayFull(e.target.checked)} /> Pay the full amount online
              </label>
            )}

            {quote ? (
              <>
                <dl className="space-y-1.5 text-sm">
                  <Row k="Turf price" v={rupees(quote.quote.totalPrice)} />
                  {quote.quote.discount > 0 && <Row k={`Offer ${quote.offer?.code ?? ""}`} v={`− ${rupees(quote.quote.discount)}`} className="text-brand-700" />}
                  <Row k={payFull ? "Paid online" : "Advance (online)"} v={rupees(quote.quote.advanceAmount)} />
                  {quote.quote.platformFee > 0 && <Row k="Platform fee" v={rupees(quote.quote.platformFee)} />}
                  <Row k="Pay at the turf" v={rupees(quote.quote.balanceDue)} />
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
                    <span>Pay now</span>
                    <span>{rupees(quote.quote.onlineAmount)}</span>
                  </div>
                </dl>
                <details className="text-xs text-slate-600">
                  <summary className="cursor-pointer font-semibold text-slate-700">Cancellation: {quote.policy.label.toLowerCase()}</summary>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {quote.policy.lines.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </details>
              </>
            ) : (
              <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
            )}

            <button className="btn-primary hidden w-full py-3 text-base md:flex" disabled={!canContinue} onClick={reserve}>
              {submitting && <Loader2 size={16} className="animate-spin" />}
              {p.signedIn ? `Continue · pay ${payNow}` : "Sign in to book"}
            </button>
            {quote && <p className="text-center text-[11px] text-slate-500">We hold the slot for {quote.holdMinutes} minutes while you pay.</p>}
          </div>
        )}
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>

      {/* Phones: always-visible bar with the choice so far and the next step. */}
      {p.bookable && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 leading-tight">
              {slot ? (
                <>
                  <div className="truncate text-sm font-semibold">{dayLabel(date).wd === "Today" ? "Today" : `${dayLabel(date).wd} ${dayLabel(date).dm}`} · {slotRange(slot.startMinute, slot.endMinute)}</div>
                  <div className="text-xs text-slate-500">Pay {payNow} now{quote && quote.quote.balanceDue > 0 ? ` · ${rupees(quote.quote.balanceDue)} at turf` : ""}</div>
                </>
              ) : (
                <>
                  <div className="text-sm font-semibold">{fromPrice != null ? `From ${rupees(fromPrice)} / ${durationLabel(duration)}` : "Pick a day and time"}</div>
                  <div className="text-xs text-slate-500">Reserve with {rupees(p.advance)} online</div>
                </>
              )}
            </div>
            {slot ? (
              <button className="btn-primary px-6 py-3 text-base" disabled={!canContinue} onClick={reserve}>
                {submitting && <Loader2 size={16} className="animate-spin" />} Continue
              </button>
            ) : (
              <a href="#slots" className="btn-dark px-5 py-3 text-base">Choose time</a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const Row = ({ k, v, className }: { k: string; v: string; className?: string }) => (
  <div className={clsx("flex justify-between", className)}><dt className="text-slate-600">{k}</dt><dd className="font-medium">{v}</dd></div>
);
