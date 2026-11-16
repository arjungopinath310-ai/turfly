"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Timer } from "lucide-react";

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void };
  }
}

function loadScript() {
  return new Promise<void>((res, rej) => {
    if (window.Razorpay) return res();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => res();
    s.onerror = () => rej(new Error("Could not load payment window"));
    document.body.appendChild(s);
  });
}

export function Checkout(p: { bookingId: string; status: string; holdExpiresAt: string | null; mock: boolean; turfSlug: string }) {
  const router = useRouter();
  // null until mounted, so server and client render the same markup
  const [left, setLeft] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "paying" | "verifying" | "failed">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [order, setOrder] = useState<{ orderId: string; provider: string } | null>(null);
  const polling = useRef(false);

  useEffect(() => {
    const tick = () => setLeft(p.holdExpiresAt ? Math.max(0, new Date(p.holdExpiresAt).getTime() - Date.now()) : 0);
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [p.holdExpiresAt]);

  /** Booking is confirmed by the server webhook; we only poll for the result. */
  async function poll() {
    if (polling.current) return;
    polling.current = true;
    setPhase("verifying");
    for (let i = 0; i < 60; i++) {
      const r = await fetch(`/api/bookings/${p.bookingId}`, { cache: "no-store" });
      const j = await r.json();
      if (j.status === "CONFIRMED") return router.replace(`/bookings/${p.bookingId}?new=1`);
      if (j.payment?.status === "FAILED") {
        polling.current = false;
        setPhase("failed");
        return setMsg(j.payment.failureReason ?? "Payment failed. You can try again while your hold lasts.");
      }
      if (j.status === "EXPIRED" && i > 10) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    polling.current = false;
    setPhase("failed");
    setMsg("We haven't received payment confirmation yet. If money was debited, it will be confirmed or refunded automatically. Check My bookings in a few minutes.");
  }

  async function pay() {
    setMsg(null);
    setPhase("paying");
    try {
      const r = await fetch("/api/payments/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookingId: p.bookingId }) });
      const o = await r.json();
      if (!r.ok) throw new Error(o.error);
      setOrder(o);
      if (o.provider === "mock") return; // mock buttons rendered below
      await loadScript();
      const rz = new window.Razorpay!({
        key: o.keyId,
        order_id: o.orderId,
        amount: o.amount,
        currency: o.currency,
        name: "Turfly",
        description: `Booking ${o.bookingCode}`,
        prefill: o.prefill,
        theme: { color: "#039855" },
        handler: async (resp: Record<string, string>) => {
          await fetch("/api/payments/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(resp) }).catch(() => {});
          poll();
        },
        modal: { ondismiss: () => setPhase("idle") },
      });
      rz.on("payment.failed", () => { setPhase("failed"); setMsg("Payment failed. You can retry while your hold lasts."); });
      rz.open();
    } catch (e) {
      setPhase("failed");
      setMsg((e as Error).message);
    }
  }

  async function mock(outcome: "success" | "failure") {
    if (!order) return;
    await fetch("/api/payments/mock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: order.orderId, outcome }) });
    poll();
  }

  async function abandon() {
    await fetch(`/api/bookings/${p.bookingId}/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "Checkout abandoned" }) });
    router.replace(`/turfs/${p.turfSlug}`);
  }

  if (left === null) return <div className="h-24 animate-pulse rounded-xl bg-slate-100" />;
  if (p.status !== "HELD" || left === 0)
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-slate-600">{p.status === "HELD" ? "Your hold expired and the slot was released." : `This booking is ${p.status.toLowerCase()}.`}</p>
        <Link href={`/turfs/${p.turfSlug}`} className="btn-primary w-full">Pick a slot again</Link>
      </div>
    );

  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000).toString().padStart(2, "0");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-2 rounded-xl bg-amber-50 py-2 text-sm font-semibold text-amber-800">
        <Timer size={16} /> Slot held for {mm}:{ss}
      </div>
      {phase === "verifying" ? (
        <div className="flex items-center justify-center gap-2 py-3 text-sm text-slate-600">
          <Loader2 size={16} className="animate-spin" /> Waiting for payment confirmation from the gateway…
        </div>
      ) : order?.provider === "mock" ? (
        <div className="space-y-2 rounded-xl border border-dashed border-violet-300 bg-violet-50 p-3">
          <p className="text-xs text-violet-800">Mock gateway (development). Razorpay keys are not configured. These buttons send a simulated webhook through the real confirmation code.</p>
          <button className="btn-primary w-full" onClick={() => mock("success")}><CheckCircle2 size={16} /> Simulate successful UPI payment</button>
          <button className="btn-danger w-full" onClick={() => mock("failure")}>Simulate failed payment</button>
        </div>
      ) : (
        <button className="btn-primary w-full py-3 text-base" onClick={pay} disabled={phase === "paying"}>
          {phase === "paying" && <Loader2 size={16} className="animate-spin" />} Pay securely
        </button>
      )}
      {msg && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>}
      {phase === "failed" && order?.provider !== "mock" && <button className="btn-ghost w-full" onClick={pay}>Retry payment</button>}
      <button className="w-full text-xs text-slate-500 hover:underline" onClick={abandon}>Cancel and release slot</button>
    </div>
  );
}
