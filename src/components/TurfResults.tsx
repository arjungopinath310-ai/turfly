"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { List, Map as MapIcon } from "lucide-react";
import type { TurfCard } from "@/lib/search";
import { TurfCardView } from "./TurfCard";
import { Empty } from "./ui";

const TurfMap = dynamic(() => import("./TurfMap"), { ssr: false, loading: () => <div className="card h-[560px] animate-pulse" /> });

export function TurfResults({ rows, center, header }: { rows: TurfCard[]; center: { lat: number; lng: number }; header?: React.ReactNode }) {
  const [view, setView] = useState<"list" | "map">("list");
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">{header}</div>
        <div className="inline-flex shrink-0 rounded-xl border border-slate-200 bg-white p-0.5 text-[13px]">
          {(["list", "map"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium capitalize ${view === v ? "bg-slate-900 text-white" : "text-slate-600"}`}>
              {v === "list" ? <List size={15} /> : <MapIcon size={15} />} {v}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <Empty title="No turfs match">Try removing a filter or searching a nearby place.</Empty>
      ) : view === "list" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {rows.map((t) => (
            <TurfCardView key={t.id} t={t} />
          ))}
        </div>
      ) : (
        <TurfMap rows={rows} center={center} />
      )}
    </div>
  );
}
