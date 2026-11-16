import { prisma } from "@/lib/db";
import { ActionForm } from "@/components/ActionForm";
import { TurfFields } from "@/components/TurfFields";
import { PageHeader } from "@/components/ui";
import { registerTurf } from "../../actions";

export default async function NewTurf() {
  const cities = await prisma.city.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Register your turf" subtitle="Free to list. We review every turf before it goes live." />
      <ActionForm action={registerTurf} className="card space-y-6 p-6" submit="Create turf & continue">
        <TurfFields cities={cities} />
        <div>
          <label className="label">Pitch layout</label>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              ["convertible", "7-a-side that splits into two 5-a-side", "Full pitch, Pitch A and Pitch B with automatic conflict rules"],
              ["single5", "Single 5-a-side pitch", ""],
              ["single7", "Single 7-a-side pitch", ""],
            ].map(([v, t, d], i) => (
              <label key={v} className="card cursor-pointer p-3 text-sm has-[:checked]:border-brand-500 has-[:checked]:ring-4 has-[:checked]:ring-brand-500/15">
                <input type="radio" name="preset" value={v} defaultChecked={i === 0} className="mr-2 accent-brand-600" />
                <b>{t}</b>
                {d && <span className="mt-1 block text-xs text-slate-500">{d}</span>}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">You can build any custom layout later (more pitches, shared areas, etc.).</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Price / hour, full pitch (₹)</label>
            <input name="price" type="number" min={0} step={50} defaultValue={1500} className="input" />
          </div>
          <div>
            <label className="label">Price / hour, each 5-a-side half (₹)</label>
            <input name="halfPrice" type="number" min={0} step={50} defaultValue={900} className="input" />
          </div>
        </div>
      </ActionForm>
    </div>
  );
}
