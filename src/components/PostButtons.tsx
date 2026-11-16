"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function JoinPostButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState<string | null>(null);
  if (!open) return <button className="btn-primary btn-sm" onClick={() => setOpen(true)}>Request to join</button>;
  return (
    <div className="space-y-2">
      <input className="input" placeholder="Short message (position, experience…)" value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={300} />
      <button
        className="btn-primary btn-sm"
        onClick={async () => {
          const r = await fetch(`/api/player-posts/${id}/requests`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: msg || undefined }) });
          const j = await r.json();
          if (!r.ok) return setErr(j.error);
          router.refresh();
        }}
      >
        Send request
      </button>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

export function RespondButtons({ id }: { id: string }) {
  const router = useRouter();
  const send = async (decision: "ACCEPTED" | "DECLINED") => {
    await fetch(`/api/player-posts/requests/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) });
    router.refresh();
  };
  return (
    <span className="flex gap-1">
      <button className="btn-primary btn-sm" onClick={() => send("ACCEPTED")}>Accept</button>
      <button className="btn-ghost btn-sm" onClick={() => send("DECLINED")}>Decline</button>
    </span>
  );
}
