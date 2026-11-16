"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function TurfSwitcher({ turfs, current }: { turfs: { id: string; name: string }[]; current: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  if (turfs.length < 2) return null;
  return (
    <select
      className="input w-auto"
      value={current}
      onChange={(e) => {
        const q = new URLSearchParams(sp.toString());
        q.set("turf", e.target.value);
        router.push(`${path}?${q}`);
      }}
    >
      {turfs.map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
  );
}
