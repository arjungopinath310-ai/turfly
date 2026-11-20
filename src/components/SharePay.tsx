"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

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

/** A friend pays their split share. The share is marked paid only by the gateway webhook; we poll for it. */
export function SharePay(p: { token: string; amountLabel: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "paying" | "verifying" | "failed">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [order, setOrder] = useState<{ orderId: string; provider: string } | null>(null);
  const polling = useRef(false);

  async function poll() {
    if (polling.current) return;
    polling.current = true;
    setPhase("verifying");
    for (let i = 0; i < 60; i++) {
      const j = await (await fetch(`/api/split/${p.token}`, { cache: "no-store" })).json();
      if (j.paid || j.refunded) return router.refresh();
      if (j.payment?.status === "FAILED") {
        polling.current = false;
        setPhase("failed");
        return setMsg(j.payment.failureReason ?? "Payment failed. You can try again.");
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    polling.current = false;
    setPhase("failed");
    setMsg("We haven't received confirmation yet. If money was debited, it will be recorded or refunded automatically.");
  }

  async function pay() {
    setMsg(null);
    setPhase("paying");
    try {
      const r = await fetch(`/api/split/${p.token}/pay`, { method: "POST" });
      const o = await r.json();
      if (!r.ok) throw new Error(o.error);
      setOrder(o);
      if (o.provider === "mock") return setPhase("idle");
      await loadScript();
      const rz = new window.Razorpay!({
        key: o.keyId,
        order_id: o.orderId,
        amount: o.amount,
        currency: o.currency,
        name: "Turfly",
        description: `Share for ${o.bookingCode}`,
        prefill: o.prefill,
        theme: { color: "#0f1a13" },
        handler: async (resp: Record<string, string>) => {
          await fetch("/api/payments/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(resp) }).catch(() => {});
          poll();
        },
        modal: { ondismiss: () => setPhase("idle") },
      });
      rz.on("payment.failed", () => { setPhase("failed"); setMsg("Payment failed. You can try again."); });
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

  return (
    <div className="space-y-3">
      {phase === "verifying" ? (
        <div className="flex items-center justify-center gap-2 py-3 text-sm text-slate-600">
          <Loader2 size={16} className="animate-spin" /> Waiting for payment confirmation…
        </div>
      ) : order?.provider === "mock" ? (
        <div className="space-y-2 rounded-xl border border-dashed border-ink/40 bg-volt/25 p-3">
          <p className="text-xs text-ink">Demo payment: no real money is charged. These buttons go through the real confirmation code.</p>
          <button className="btn-primary w-full" onClick={() => mock("success")}><CheckCircle2 size={16} /> Simulate successful UPI payment</button>
          <button className="btn-danger w-full" onClick={() => mock("failure")}>Simulate failed payment</button>
        </div>
      ) : (
        <button className="btn-primary w-full py-3 text-base" onClick={pay} disabled={phase === "paying"}>
          {phase === "paying" && <Loader2 size={16} className="animate-spin" />} Pay my share · {p.amountLabel}
        </button>
      )}
      {msg && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>}
      {phase === "failed" && order?.provider === "mock" && <button className="btn-ghost w-full" onClick={() => { setOrder(null); setPhase("idle"); }}>Try again</button>}
    </div>
  );
}
