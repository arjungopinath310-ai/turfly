import Link from "next/link";
import { pageUser } from "@/lib/auth";
import { manageableTurfs } from "@/lib/owner";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";

export default async function MyTurfs() {
  const user = await pageUser("/owner/turfs");
  const turfs = await manageableTurfs(user);
  return (
    <div>
      <PageHeader title="My turfs">
        <Link href="/owner/turfs/new" className="btn-primary">Register a turf</Link>
      </PageHeader>
      {turfs.length === 0 && <Empty title="No turfs yet">Register your turf, or use the claim link we sent if your turf is already listed.</Empty>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {turfs.map((t) => (
          <Link key={t.id} href={`/owner/turfs/${t.id}`} className="card flex items-center justify-between p-5 hover:shadow-lg">
            <div>
              <div className="font-semibold">{t.name}</div>
              <div className="mt-1 flex gap-1.5"><StatusBadge status={t.status} /><StatusBadge status={t.availabilityMode} /></div>
            </div>
            <span className="text-sm text-brand-700">Settings →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
