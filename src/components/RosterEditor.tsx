"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Crown, MessageCircle, Plus, Trash2 } from "lucide-react";
import { whatsappShare } from "@/lib/share";

type Status = "CONFIRMED" | "PENDING" | "DECLINED";
interface P { id?: string; teamMemberId: string | null; name: string; status: Status; isCaptain: boolean; isSubstitute: boolean }

export function RosterEditor(props: { bookingId: string; editable: boolean; teamName: string; teamMembers: { id: string; name: string }[]; players: P[]; inviteText: string; playersPerSide: number }) {
  const router = useRouter();
  const [teamName, setTeamName] = useState(props.teamName);
  const [players, setPlayers] = useState<P[]>(props.players);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const unused = props.teamMembers.filter((m) => !players.some((p) => p.teamMemberId === m.id));
  const confirmed = players.filter((p) => p.status === "CONFIRMED" && !p.isSubstitute).length;

  const update = (i: number, patch: Partial<P>) =>
    setPlayers((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : patch.isCaptain ? { ...p, isCaptain: false } : p)));

  async function save() {
    setSaving(true);
    setMsg(null);
    const r = await fetch(`/api/bookings/${props.bookingId}/roster`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamName: teamName || null, players }),
    });
    const j = await r.json();
    setSaving(false);
    setMsg(r.ok ? "Saved" : j.error);
    if (r.ok) router.refresh();
  }

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2">Match squad</h2>
        <span className="text-sm text-slate-500">{confirmed}/{props.playersPerSide} confirmed starters</span>
      </div>
      <div className="mt-3">
        <label className="label">Team name for this match</label>
        <input className="input" value={teamName} onChange={(e) => setTeamName(e.target.value)} disabled={!props.editable} maxLength={60} />
      </div>
      <ul className="mt-4 divide-y divide-slate-100">
        {players.map((p, i) => (
          <li key={p.id ?? `n${i}`} className="flex flex-wrap items-center gap-2 py-2.5">
            <span className="flex-1 font-medium">
              {p.name} {p.isCaptain && <Crown size={14} className="inline text-amber-500" />}
              {p.isSubstitute && <span className="ml-1 text-xs text-slate-400">(sub)</span>}
            </span>
            {props.editable ? (
              <>
                <select className="input w-32 py-1.5 text-xs" value={p.status} onChange={(e) => update(i, { status: e.target.value as Status })}>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="PENDING">Pending</option>
                  <option value="DECLINED">Declined</option>
                </select>
                <button className={`btn-sm btn-ghost ${p.isCaptain ? "!border-amber-300 !bg-amber-50" : ""}`} onClick={() => update(i, { isCaptain: !p.isCaptain })}>Captain</button>
                <button className={`btn-sm btn-ghost ${p.isSubstitute ? "!border-slate-400 !bg-slate-100" : ""}`} onClick={() => update(i, { isSubstitute: !p.isSubstitute })}>Sub</button>
                <button className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => setPlayers((ps) => ps.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={15} /></button>
              </>
            ) : (
              <span className="text-xs text-slate-500">{p.status.toLowerCase()}</span>
            )}
          </li>
        ))}
        {players.length === 0 && <li className="py-3 text-sm text-slate-500">No players added yet.</li>}
      </ul>
      {props.editable && (
        <div className="mt-3 space-y-3">
          <div className="flex gap-2">
            <input className="input" placeholder="Add player by name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} />
            <button className="btn-ghost" disabled={!newName.trim()} onClick={() => { setPlayers((ps) => [...ps, { teamMemberId: null, name: newName.trim(), status: "PENDING", isCaptain: false, isSubstitute: false }]); setNewName(""); }}>
              <Plus size={15} /> Add
            </button>
          </div>
          {unused.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-slate-500">From team:</span>
              {unused.map((m) => (
                <button key={m.id} className="chip border-slate-200 hover:bg-slate-50" onClick={() => setPlayers((ps) => [...ps, { teamMemberId: m.id, name: m.name, status: "PENDING", isCaptain: false, isSubstitute: false }])}>+ {m.name}</button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={save} disabled={saving}>Save squad</button>
            <a className="btn-ghost" target="_blank" href={whatsappShare(`${props.inviteText}\n\nYou're invited! Reply IN or OUT 🙌`)}><MessageCircle size={15} /> Invite on WhatsApp</a>
            {msg && <span className="self-center text-sm text-slate-600">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
