"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Crown, MessageCircle, Pencil, Trash2, UserPlus } from "lucide-react";
import { POSITIONS } from "@/lib/brand";
import { whatsappShare } from "@/lib/share";
import { ImagePicker } from "./ImagePicker";
import { formatPhone } from "@/lib/format";

interface Member { id: string; name: string; position: string | null; jerseyNumber: number | null; photoUrl: string | null; isCaptain: boolean; status: string; registered: boolean; phone: string | null; email: string | null }
const blank = { name: "", phone: "", email: "", position: "", jerseyNumber: "", photoUrl: null as string | null };

export function TeamEditor(p: { team: { id: string; name: string; playersPerSide: number; logoUrl: string | null }; members: Member[]; isOwner: boolean; inviteUrl: string | null }) {
  const router = useRouter();
  const [name, setName] = useState(p.team.name);
  const [logo, setLogo] = useState(p.team.logoUrl);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const req = async (url: string, method: string, body?: unknown) => {
    setMsg(null);
    const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json();
    if (!r.ok) {
      setMsg(j.error);
      return false;
    }
    router.refresh();
    return true;
  };

  const memberBody = () => ({
    name: form.name,
    phone: form.phone || null,
    email: form.email || null,
    position: form.position || null,
    jerseyNumber: form.jerseyNumber ? Number(form.jerseyNumber) : null,
    photoUrl: form.photoUrl,
  });

  async function submitMember() {
    const ok = editing
      ? await req(`/api/teams/${p.team.id}/members/${editing}`, "PATCH", memberBody())
      : await req(`/api/teams/${p.team.id}/members`, "POST", memberBody());
    if (ok) {
      setForm(blank);
      setEditing(null);
    }
  }

  const inviteMsg = p.inviteUrl ? `Join my football team "${p.team.name}" on Turfly ⚽\n${p.inviteUrl}` : "";

  return (
    <div className="mt-3 space-y-6">
      <div className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
        {p.isOwner ? <ImagePicker value={logo} onChange={(v) => { setLogo(v); req(`/api/teams/${p.team.id}`, "PATCH", { logoUrl: v }); }} label="Change logo" /> : null}
        <div className="flex-1">
          {p.isOwner ? (
            <div className="flex gap-2">
              <input className="input text-lg font-bold" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
              <button className="btn-ghost" disabled={name === p.team.name || name.trim().length < 2} onClick={() => req(`/api/teams/${p.team.id}`, "PATCH", { name })}>Rename</button>
            </div>
          ) : (
            <h1 className="h1">{p.team.name}</h1>
          )}
          <div className="mt-1 text-sm text-slate-500">{p.team.playersPerSide}-a-side · {p.members.length} player{p.members.length === 1 ? "" : "s"}</div>
        </div>
        {p.inviteUrl && (
          <div className="flex gap-2">
            <button className="btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(p.inviteUrl!); setMsg("Invite link copied"); }}><Copy size={14} /> Copy link</button>
            <a className="btn-primary btn-sm" target="_blank" href={whatsappShare(inviteMsg)}><MessageCircle size={14} /> WhatsApp invite</a>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_320px]">
        <div className="card divide-y divide-slate-100">
          {p.members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-4">
              <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {m.photoUrl ? <img src={m.photoUrl} alt="" className="h-full w-full object-cover" /> : m.name.slice(0, 1)}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  {m.name} {m.isCaptain && <Crown size={14} className="text-amber-500" />}
                  {m.jerseyNumber != null && <span className="text-xs text-slate-400">#{m.jerseyNumber}</span>}
                </div>
                <div className="text-xs text-slate-500">
                  {m.position ?? "Any position"} · {m.registered ? "Registered" : "Invited"}
                  {m.phone && ` · ${formatPhone(m.phone)}`}
                </div>
              </div>
              {p.isOwner && (
                <div className="flex gap-1">
                  {!m.isCaptain && <button className="btn-ghost btn-sm" onClick={() => req(`/api/teams/${p.team.id}/members/${m.id}`, "PATCH", { isCaptain: true })}>Make captain</button>}
                  <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Edit" onClick={() => { setEditing(m.id); setForm({ name: m.name, phone: m.phone && m.phone !== "Hidden" ? m.phone : "", email: m.email ?? "", position: m.position ?? "", jerseyNumber: m.jerseyNumber?.toString() ?? "", photoUrl: m.photoUrl }); }}><Pencil size={15} /></button>
                  <button className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove" onClick={() => confirm(`Remove ${m.name}?`) && req(`/api/teams/${p.team.id}/members/${m.id}`, "DELETE")}><Trash2 size={15} /></button>
                </div>
              )}
            </div>
          ))}
        </div>

        {p.isOwner && (
          <div className="card h-fit space-y-3 p-5">
            <h2 className="h2 flex items-center gap-2"><UserPlus size={18} /> {editing ? "Edit / replace player" : "Add player"}</h2>
            <input className="input" placeholder="Full name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input" placeholder="Mobile (optional)" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className="input" placeholder="Email (optional)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <select className="input" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })}>
                <option value="">Position</option>
                {POSITIONS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <input className="input" placeholder="Jersey #" inputMode="numeric" value={form.jerseyNumber} onChange={(e) => setForm({ ...form, jerseyNumber: e.target.value.replace(/\D/g, "") })} />
            </div>
            <ImagePicker value={form.photoUrl} onChange={(v) => setForm({ ...form, photoUrl: v })} label="Photo" round />
            <p className="text-[11px] text-slate-500">Numbers are visible only to you, never to other players, unless the player opts in from their profile.</p>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={!form.name.trim()} onClick={submitMember}>{editing ? "Save" : "Add player"}</button>
              {editing && <button className="btn-ghost" onClick={() => { setEditing(null); setForm(blank); }}>Cancel</button>}
            </div>
          </div>
        )}
      </div>
      {msg && <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{msg}</p>}
    </div>
  );
}
