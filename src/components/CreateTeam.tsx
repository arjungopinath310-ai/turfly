"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePicker } from "./ImagePicker";

export function CreateTeam() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pps, setPps] = useState(5);
  const [logo, setLogo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function create() {
    const r = await fetch("/api/teams", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, playersPerSide: pps, logoUrl: logo }) });
    const j = await r.json();
    if (!r.ok) return setErr(j.error);
    router.push(`/teams/${j.id}`);
  }
  return (
    <div className="card h-fit space-y-3 p-5">
      <h2 className="h2">New team</h2>
      <div>
        <label className="label">Team name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Manjeri Strikers" />
      </div>
      <div>
        <label className="label">Format</label>
        <div className="grid grid-cols-2 gap-2">
          {[5, 7].map((n) => (
            <button key={n} type="button" onClick={() => setPps(n)} className={`btn ${pps === n ? "bg-slate-900 text-white" : "btn-ghost"}`}>{n}-a-side</button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Logo</label>
        <ImagePicker value={logo} onChange={setLogo} />
      </div>
      <button className="btn-primary w-full" disabled={name.trim().length < 2} onClick={create}>Create team</button>
      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}
