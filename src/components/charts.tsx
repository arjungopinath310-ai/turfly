"use client";
/**
 * Small dependency-free SVG charts for the owner analytics view.
 * Follows the dataviz method: one axis, thin bars (≤24px, 4px rounded data-end, square at the baseline),
 * hairline recessive grid, hover tooltip on every mark, and a table view for every chart.
 * Colours come from the validated reference palette via CSS variables on .viz-root (globals.css).
 */
import { useEffect, useRef, useState } from "react";

import { fmtValue, type Fmt } from "@/lib/chartFormat";

export { fmtValue };

function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.0001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function Tooltip({ x, y, title, lines, width }: { x: number; y: number; title: string; lines: string[]; width: number }) {
  const left = Math.min(Math.max(8, x - 80), width - 168);
  return (
    <div className="pointer-events-none absolute z-10 w-40 rounded-lg border border-[color:var(--viz-border)] bg-white px-3 py-2 text-xs shadow-lg" style={{ left, top: Math.max(0, y - 64) }}>
      <div className="font-semibold text-[color:var(--viz-ink)]">{title}</div>
      {lines.map((l) => (
        <div key={l} className="text-[color:var(--viz-ink-2)]">{l}</div>
      ))}
    </div>
  );
}

export function TableView({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-[color:var(--viz-muted)] hover:text-slate-700">View as table</summary>
      <div className="mt-2 max-h-64 overflow-auto">
        <table className="table" style={{ fontVariantNumeric: "tabular-nums" }}>
          <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

/** Single-series column chart (e.g. booking value per day). */
export function ColumnChart({ labels, tooltipLabels, values, format, height = 220, ariaLabel, secondary }: { labels: string[]; tooltipLabels?: string[]; values: number[]; format: Fmt; height?: number; ariaLabel: string; secondary?: { label: string; values: number[]; format: Fmt } }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 52, r: 8, t: 12, b: 26 };
  const allZero = values.every((v) => v === 0);
  const ticks = allZero ? [0] : niceTicks(Math.max(0, ...values));
  const max = ticks[ticks.length - 1] || 1;
  const n = values.length;
  const band = (width - pad.l - pad.r) / Math.max(1, n);
  const bw = Math.max(2, Math.min(24, band * 0.62));
  const ih = height - pad.t - pad.b;
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((width - pad.l) / 64))));
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--viz-muted)" style={{ fontVariantNumeric: "tabular-nums" }}>{fmtValue(t, format, true)}</text>
          </g>
        ))}
        {values.map((v, i) => {
          const cx = pad.l + band * i + band / 2;
          const top = y(v);
          const h = Math.max(0, pad.t + ih - top);
          const r = Math.min(4, h, bw / 2);
          const x0 = cx - bw / 2;
          const base = pad.t + ih;
          return (
            <g key={i}>
              {h > 0 && (
                <path
                  d={`M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${base} Z`}
                  fill="var(--viz-s1)"
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              {i % every === 0 && (
                <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--viz-muted)">{labels[i]}</text>
              )}
              <rect x={pad.l + band * i} y={pad.t} width={band} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
            </g>
          );
        })}
        {allZero && <text x={(width + pad.l) / 2} y={pad.t + ih / 2} textAnchor="middle" fontSize={12} fill="var(--viz-muted)">No bookings in this period</text>}
      </svg>
      {hover !== null && (
        <Tooltip
          x={pad.l + band * hover + band / 2}
          y={y(values[hover])}
          width={width}
          title={(tooltipLabels ?? labels)[hover]}
          lines={[fmtValue(values[hover], format), ...(secondary ? [`${secondary.label}: ${fmtValue(secondary.values[hover], secondary.format)}`] : [])]}
        />
      )}
    </div>
  );
}

const RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]; // sequential blue, light→dark
const rampColor = (v: number) => (v <= 0 ? "var(--viz-zero)" : RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))]);
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon first
const DAY_START = 5; // must match OPERATING_DAY_START_HOUR in lib/analytics.ts
const hourLabel = (h: number) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);

/** Weekday × hour utilisation heatmap (sequential single hue). null = closed at that hour. */
export function Heatmap({ grid }: { grid: (number | null)[][] }) {
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  // Operating day runs 5 AM → 5 AM, so late-night hours (12–1 AM) sit at the end of the row they belong to.
  const hours = Array.from({ length: 24 }, (_, i) => (i + DAY_START) % 24).filter((h) => grid.some((row) => row[h] !== null));
  if (!hours.length) return <p className="py-6 text-center text-sm text-slate-500">Set operating hours to see utilisation.</p>;
  const pctText = (v: number | null) => (v === null ? "Closed" : `${Math.round(v * 100)}% booked`);
  return (
    <div>
      <div className="overflow-x-auto">
        <div className="relative inline-grid gap-[2px]" style={{ gridTemplateColumns: `36px repeat(${hours.length}, minmax(22px, 1fr))` }} onMouseLeave={() => setHover(null)} role="img" aria-label="Share of pitch area booked, by weekday and hour">
          <div />
          {hours.map((h) => <div key={h} className="pb-1 text-center text-[10px] text-[color:var(--viz-muted)]">{h % 2 === 0 ? hourLabel(h) : ""}</div>)}
          {ORDER.map((d) => (
            <div key={d} className="contents">
              <div className="pr-1 text-right text-[11px] leading-6 text-[color:var(--viz-muted)]">{DAYS[d]}</div>
              {hours.map((h) => {
                const v = grid[d][h];
                const on = hover?.d === d && hover?.h === h;
                return (
                  <div
                    key={h}
                    onMouseEnter={() => setHover({ d, h })}
                    className="h-6 rounded-[3px]"
                    style={{
                      background: v === null ? "repeating-linear-gradient(45deg, var(--viz-zero), var(--viz-zero) 3px, transparent 3px, transparent 6px)" : rampColor(v),
                      outline: on ? "2px solid var(--viz-ink)" : undefined,
                      outlineOffset: on ? 1 : undefined,
                    }}
                    title={`${DAYS[d]} ${hourLabel(h)} · ${pctText(v)}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-[color:var(--viz-ink-2)]">
        <span className="min-w-[150px]">{hover ? <b>{DAYS[hover.d]} {hourLabel(hover.h)} · {pctText(grid[hover.d][hover.h])}</b> : "Hover a cell for details"}</span>
        <span className="flex items-center gap-1">0%
          {[0.001, ...RAMP.map((_, i) => (i + 0.5) / RAMP.length)].map((v, i) => <span key={i} className="h-3 w-5 rounded-[2px]" style={{ background: rampColor(v) }} />)}
          100%</span>
        <span className="flex items-center gap-1"><span className="h-3 w-5 rounded-[2px]" style={{ background: "repeating-linear-gradient(45deg, var(--viz-zero), var(--viz-zero) 3px, transparent 3px, transparent 6px)" }} /> closed</span>
      </div>
      <TableView
        head={["Day", ...hours.map(hourLabel)]}
        rows={ORDER.map((d) => [DAYS[d], ...hours.map((h) => (grid[d][h] === null ? "–" : `${Math.round((grid[d][h] as number) * 100)}%`))])}
      />
    </div>
  );
}

/** Tall segmented bar: one whole split into parts (e.g. booking source). Legend always present. */
export function SegmentedBar({ parts }: { parts: { label: string; value: number }[] }) {
  const colors = ["var(--viz-s1)", "var(--viz-s2)", "var(--viz-s3)"];
  const total = parts.reduce((t, p) => t + p.value, 0);
  const [hover, setHover] = useState<number | null>(null);
  if (!total) return <p className="py-4 text-sm text-slate-500">No bookings in this period.</p>;
  return (
    <div>
      <div className="flex h-7 w-full gap-[2px]" role="img" aria-label={parts.map((p) => `${p.label} ${p.value} (${Math.round((p.value / total) * 100)}%)`).join(", ")} onMouseLeave={() => setHover(null)}>
        {parts.map((p, i) =>
          p.value ? (
            <div key={p.label} onMouseEnter={() => setHover(i)} className="flex items-center overflow-visible rounded-[4px] px-2 text-[11px] font-semibold text-white" style={{ width: `${(p.value / total) * 100}%`, background: colors[i], opacity: hover === null || hover === i ? 1 : 0.6 }} title={`${p.label}: ${p.value} (${Math.round((p.value / total) * 100)}%)`}>
              {p.value / total >= 0.12 ? `${Math.round((p.value / total) * 100)}%` : ""}
            </div>
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-[color:var(--viz-ink-2)]">
        {parts.map((p, i) => (
          <span key={p.label} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: colors[i] }} />{p.label} <b className="text-[color:var(--viz-ink)]">{p.value}</b></span>
        ))}
      </div>
    </div>
  );
}

/** Ranked horizontal bars with the value at the tip (single series, no legend). */
export function BarList({ rows, format }: { rows: { label: string; value: number; note?: string }[]; format: Fmt }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-4 text-sm text-slate-500">Nothing to show for this period.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${fmtValue(r.value, format)}${r.note ? ` · ${r.note}` : ""}`}>
          <div className="mb-1 flex justify-between gap-3 text-xs">
            <span className="truncate text-[color:var(--viz-ink)]">{r.label}</span>
            <span className="shrink-0 text-[color:var(--viz-ink-2)]" style={{ fontVariantNumeric: "tabular-nums" }}>{fmtValue(r.value, format)}{r.note ? <span className="text-[color:var(--viz-muted)]"> · {r.note}</span> : null}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-[color:var(--viz-zero)]">
            <div className="h-2 rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: "var(--viz-s1)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
