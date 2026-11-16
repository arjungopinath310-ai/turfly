"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { List, Map as MapIcon } from "lucide-react";
import type { TurfCard } from "@/lib/search";
import { TurfCardView } from "./TurfCard";
import { Empty } from "./ui";

const TurfMap = dynamic(() => import("./TurfMap"), { ssr: false, loading: () => <div className="card h-[560px] animate-pulse" /> });

export function TurfResults({ rows, center }: { rows: TurfCard[]; center: { lat: number; lng: number } }) {
  const [view, setView] = useState<"list" | "map">("list");
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-sm">
          {(["list", "map"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium capitalize ${view === v ? "bg-slate-900 text-white" : "text-slate-600"}`}>
              {v === "list" ? <List size={15} /> : <MapIcon size={15} />} {v}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <Empty title="No turfs match these filters">Try removing a filter. If you know a turf that is missing, tell the turf owner they can list it for free.</Empty>
      ) : view === "list" ? (
        <div className="grid gap-4 sm:grid-cols-2">
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
