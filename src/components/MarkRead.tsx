"use client";
import { useRefreshingRouter as useRouter } from "./ActionForm";

export function MarkRead() {
  const router = useRouter();
  return (
    <button className="btn-ghost btn-sm" onClick={async () => { await fetch("/api/notifications", { method: "POST" }); router.refresh(); }}>
      Mark all read
    </button>
  );
}
