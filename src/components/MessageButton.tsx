"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle } from "lucide-react";

/** Opens (or creates) the chat thread and jumps to it. Player: turfId (+bookingId). Owner: turfId + playerId. */
export function MessageButton({ turfId, bookingId, playerId, label = "Message turf", signedIn = true, className = "btn-ghost btn-sm" }: { turfId: string; bookingId?: string; playerId?: string; label?: string; signedIn?: boolean; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button
        className={className}
        disabled={busy}
        onClick={async () => {
          if (!signedIn) return router.push(`/login?next=${encodeURIComponent(location.pathname)}`);
          setBusy(true);
          setErr(null);
          const r = await fetch("/api/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ turfId, bookingId, playerId }) });
          const j = await r.json();
          setBusy(false);
          if (!r.ok) return setErr(j.error);
          router.push(`/messages?c=${j.id}`);
        }}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />} {label}
      </button>
      {err && <span className="mt-1 max-w-[220px] text-xs text-red-600">{err}</span>}
    </span>
  );
}
