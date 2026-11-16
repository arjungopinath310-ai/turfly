"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function JoinTeamButton({ token }: { token: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <button
        className="btn-primary w-full"
        onClick={async () => {
          const r = await fetch("/api/teams/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
          const j = await r.json();
          if (!r.ok) return setErr(j.error);
          router.push(`/teams/${j.teamId}`);
        }}
      >
        Join team
      </button>
      {err && <p className="text-sm text-red-600">{err}</p>}
    </>
  );
}
