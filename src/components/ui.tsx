import clsx from "clsx";
import { BadgeCheck, Clock, HelpCircle } from "lucide-react";
import { relativeTime } from "@/lib/time";

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function AvailabilityBadge({ mode, updatedAt }: { mode: string; updatedAt?: Date | null }) {
  if (mode === "LIVE")
    return (
      <span className="chip border-brand-200 bg-brand-50 text-brand-700" title="Free slots are live; book here for a small booking fee">
        <BadgeCheck size={14} /> Book online
      </span>
    );
  if (mode === "OWNER_REPORTED")
    return (
      <span className="chip border-amber-200 bg-amber-50 text-amber-700" title="The owner updates this manually; it may be out of date.">
        <Clock size={14} /> Owner-reported{updatedAt ? ` · ${relativeTime(updatedAt)}` : ""}
      </span>
    );
  return (
    <span className="chip border-slate-200 bg-slate-50 text-slate-600" title="This turf doesn't take bookings on Turfly yet">
      <HelpCircle size={14} /> Call to book
    </span>
  );
}

const STATUS: Record<string, string> = {
  HELD: "bg-amber-50 text-amber-700 border-amber-200",
  CONFIRMED: "bg-brand-50 text-brand-700 border-brand-200",
  COMPLETED: "bg-slate-100 text-slate-700 border-slate-200",
  CANCELLED: "bg-red-50 text-red-700 border-red-200",
  EXPIRED: "bg-slate-50 text-slate-500 border-slate-200",
  NO_SHOW: "bg-red-50 text-red-700 border-red-200",
  APPROVED: "bg-brand-50 text-brand-700 border-brand-200",
  PENDING_REVIEW: "bg-amber-50 text-amber-700 border-amber-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  UNCLAIMED: "bg-sky-50 text-sky-700 border-sky-200",
  DRAFT: "bg-slate-50 text-slate-600 border-slate-200",
  SUSPENDED: "bg-red-50 text-red-700 border-red-200",
  CAPTURED: "bg-brand-50 text-brand-700 border-brand-200",
  CREATED: "bg-slate-50 text-slate-600 border-slate-200",
  FAILED: "bg-red-50 text-red-700 border-red-200",
  REFUNDED: "bg-sky-50 text-sky-700 border-sky-200",
  PARTIALLY_REFUNDED: "bg-sky-50 text-sky-700 border-sky-200",
  OPEN: "bg-amber-50 text-amber-700 border-amber-200",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  ACCEPTED: "bg-brand-50 text-brand-700 border-brand-200",
  DECLINED: "bg-red-50 text-red-700 border-red-200",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={clsx("chip capitalize", STATUS[status] ?? "border-slate-200 bg-slate-50 text-slate-600")}>
      {status.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}

export function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center text-amber-500" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= Math.round(value) ? "" : "text-slate-300"}>★</span>
      ))}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 p-10 text-center">
      <div className="text-3xl">🥅</div>
      <div className="font-semibold">{title}</div>
      {children && <div className="muted max-w-md">{children}</div>}
    </div>
  );
}

export function DemoBadge() {
  return <span className="chip border-violet-200 bg-violet-50 text-violet-700">Demo turf · try every feature</span>;
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="h1">{title}</h1>
        {subtitle && <p className="muted mt-1">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
