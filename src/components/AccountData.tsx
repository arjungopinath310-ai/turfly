"use client";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { Download, Trash2 } from "lucide-react";
import { forgetPushToken } from "./NativeBridge";

export function AccountData() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function del() {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/account", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Could not delete the account");
    await forgetPushToken().catch(() => {});
    await signOut({ callbackUrl: "/?deleted=1" });
  }
  return (
    <div className="card space-y-4 p-6">
      <h2 className="h2">Your data</h2>
      <a href="/api/account" className="btn-ghost w-fit"><Download size={15} /> Download my data</a>
      {!open ? (
        <button className="btn-danger w-fit" onClick={() => setOpen(true)}><Trash2 size={15} /> Delete my account</button>
      ) : (
        <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
          <p className="font-semibold text-red-800">This permanently deletes your account.</p>
          <ul className="list-disc space-y-1 pl-5 text-red-900/80">
            <li>Your name, phone number, email, teams you created and your notifications are erased.</li>
            <li>Past booking and payment records are kept without your details, because Indian tax law requires it.</li>
            <li>You must cancel upcoming bookings first. This can&apos;t be undone.</li>
          </ul>
          <input className="input" placeholder="Type DELETE to confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-danger" disabled={confirm !== "DELETE" || busy} onClick={del}>Delete permanently</button>
            <button className="btn-ghost" onClick={() => { setOpen(false); setConfirm(""); setErr(null); }}>Keep my account</button>
          </div>
          {err && <p className="text-red-700">{err}</p>}
        </div>
      )}
    </div>
  );
}
