"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Item = { id: string; name: string };
const KEY = "turfly.compare";
const EVT = "turfly-compare";

function read(): Item[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}
function write(items: Item[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {}
  window.dispatchEvent(new Event(EVT));
}
function useCompare() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    const sync = () => setItems(read());
    sync();
    window.addEventListener(EVT, sync);
    return () => window.removeEventListener(EVT, sync);
  }, []);
  return items;
}

export function CompareToggle({ id, name }: { id: string; name: string }) {
  const items = useCompare();
  const on = items.some((i) => i.id === id);
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600">
      <input
        type="checkbox"
        className="accent-brand-600"
        checked={on}
        onChange={() => {
          const cur = read();
          if (on) write(cur.filter((i) => i.id !== id));
          else if (cur.length < 3) write([...cur, { id, name }]);
          else alert("You can compare up to 3 turfs.");
        }}
      />
      Compare
    </label>
  );
}

export function CompareBar() {
  const items = useCompare();
  if (items.length === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-2xl">
      <span className="truncate">{items.map((i) => i.name).join(" · ")}</span>
      <button className="text-slate-400 hover:text-white" onClick={() => write([])}>Clear</button>
      <Link href={`/compare?ids=${items.map((i) => i.id).join(",")}`} className="btn-primary btn-sm" aria-disabled={items.length < 2}>
        Compare {items.length}
      </Link>
    </div>
  );
}
