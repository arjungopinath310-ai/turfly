import Link from "next/link";
import { prisma } from "@/lib/db";
import { AMENITIES } from "@/lib/brand";
import { getAvailability } from "@/lib/engine/booking";
import { rupees } from "@/lib/engine/pricing";
import { haversineKm } from "@/lib/search";
import { formatMinute, todayIst } from "@/lib/time";
import { AvailabilityBadge, Empty, Stars } from "@/components/ui";

export default async function Compare(
  props: { searchParams: Promise<{ ids?: string; lat?: string; lng?: string }> }
) {
  const searchParams = await props.searchParams;
  const ids = (searchParams.ids ?? "").split(",").filter(Boolean).slice(0, 3);
  const turfs = await prisma.turf.findMany({
    where: { id: { in: ids }, status: { in: ["APPROVED", "UNCLAIMED"] } },
    include: { city: true, configs: { where: { isActive: true } } },
  });
  if (turfs.length === 0) return <div className="mx-auto max-w-4xl px-4 py-10"><Empty title="Pick turfs to compare">Tick “Compare” on up to three turfs in the search results.</Empty></div>;

  const date = todayIst();
  const free = await Promise.all(
    turfs.map(async (t) => {
      if (t.availabilityMode === "NONE") return null;
      const a = await getAvailability(t.id, date, 60);
      const mins = Array.from(new Set(a.configs.flatMap((c) => c.slots.filter((s) => s.status === "available").map((s) => s.startMinute)))).sort((x, y) => x - y);
      return mins.slice(0, 6);
    }),
  );
  const origin = searchParams.lat && searchParams.lng ? { lat: Number(searchParams.lat), lng: Number(searchParams.lng) } : null;
  const allAmenities = Array.from(new Set(turfs.flatMap((t) => t.amenities)));

  const rows: [string, (t: (typeof turfs)[number], i: number) => React.ReactNode][] = [
    ["Location", (t) => `${t.locality ?? ""} ${t.city.name}`],
    ["Distance", (t) => (origin ? `${haversineKm(origin, t).toFixed(1)} km` : "Enable location on search")],
    ["Availability data", (t) => <AvailabilityBadge mode={t.availabilityMode} updatedAt={t.availabilityUpdatedAt} />],
    ["Formats", (t) => Array.from(new Set(t.configs.map((c) => `${c.playersPerSide}s`))).join(", ") || "—"],
    ["Price from", (t) => (t.configs.length ? `${rupees(Math.min(...t.configs.map((c) => c.basePricePerHour)))}/hr` : "—")],
    ["Rating", (t) => (t.ratingCount ? <span><Stars value={t.ratingAvg} /> {t.ratingAvg.toFixed(1)} ({t.ratingCount})</span> : "No reviews")],
    ["Free today", (_t, i) => (free[i] === null ? "Call turf" : free[i]!.length ? free[i]!.map(formatMinute).join(", ") : "Fully booked")],
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="h1 mb-6">Compare turfs</h1>
      <div className="card overflow-x-auto">
        <table className="table min-w-[640px]">
          <thead>
            <tr>
              <th className="w-40" />
              {turfs.map((t) => (
                <th key={t.id} className="normal-case">
                  <Link href={`/turfs/${t.slug}`} className="text-base font-bold text-slate-900 hover:underline">{t.name}</Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, f]) => (
              <tr key={k}>
                <td className="font-medium text-slate-500">{k}</td>
                {turfs.map((t, i) => (
                  <td key={t.id}>{f(t, i)}</td>
                ))}
              </tr>
            ))}
            {allAmenities.map((a) => (
              <tr key={a}>
                <td className="font-medium text-slate-500">{AMENITIES[a] ?? a}</td>
                {turfs.map((t) => (
                  <td key={t.id}>{t.amenities.includes(a) ? <span className="text-brand-600">✓</span> : <span className="text-slate-300">—</span>}</td>
                ))}
              </tr>
            ))}
            <tr>
              <td />
              {turfs.map((t) => (
                <td key={t.id}><Link href={`/turfs/${t.slug}`} className="btn-primary btn-sm">View & book</Link></td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
