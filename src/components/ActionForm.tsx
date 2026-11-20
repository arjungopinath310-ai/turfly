"use client";
import { useFormStatus } from "react-dom";
import { useActionState, useCallback, useMemo, useRef, useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type State = { ok?: string; error?: string } | null;

/** The Next.js router, whose refresh() also gets the nudge described at useSettleAfterAction. */
export function useRefreshingRouter() {
  const router = useRouter();
  const settle = useSettleAfterAction();
  return useMemo(
    () => ({
      push: router.push,
      replace: router.replace,
      back: router.back,
      forward: router.forward,
      prefetch: router.prefetch,
      refresh: () => {
        router.refresh();
        settle();
      },
    }),
    [router, settle],
  );
}

/**
 * Next 15.5 / React 19: when a server action finishes very quickly, the re-rendered page it sends back can sit
 * uncommitted (button still spinning, list not updated) until something else on the page changes. A few tiny
 * state updates right after the action lets React finish the update. Harmless when nothing is stuck.
 */
export function useSettleAfterAction() {
  const [, setTick] = useState(0);
  return useCallback(() => {
    for (const ms of [30, 250, 900]) setTimeout(() => setTick((t) => t + 1), ms);
  }, []);
}

export function ActionForm({ action, children, className, submit = "Save", submitClass = "btn-primary" }: { action: (s: State, fd: FormData) => Promise<State>; children: React.ReactNode; className?: string; submit?: string | null; submitClass?: string }) {
  const settle = useSettleAfterAction();
  // Which button was pressed (Approve / Reject…): browsers report it on the submit event, but it doesn't always
  // reach the action's form data, so it is added here when missing.
  const pressed = useRef<{ name: string; value: string } | null>(null);
  const [state, formAction] = useActionState(async (s: State, fd: FormData) => {
    const p = pressed.current;
    pressed.current = null;
    if (p && !fd.has(p.name)) fd.append(p.name, p.value);
    const r = await action(s, fd);
    settle();
    return r;
  }, null);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        const b = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | HTMLInputElement | null;
        pressed.current = b?.name ? { name: b.name, value: b.value } : null;
      }}
    >
      {children}
      {submit && <Submit label={submit} className={submitClass} />}
      {state?.error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{state.ok}</p>}
    </form>
  );
}

function Submit({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending}>
      {pending && <Loader2 size={15} className="animate-spin" />} {label}
    </button>
  );
}

/** One-click server action (e.g. "Mark balance collected"). */
export function ActionButton({ action, label, className = "btn-ghost btn-sm", confirmText }: { action: () => Promise<State>; label: string; className?: string; confirmText?: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<State>(null);
  const settle = useSettleAfterAction();
  return (
    <span className="inline-flex flex-col">
      <button
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirmText && !confirm(confirmText)) return;
          start(async () => {
            setMsg(await action());
            settle();
          });
        }}
      >
        {pending && <Loader2 size={13} className="animate-spin" />} {label}
      </button>
      {msg?.error && <span className="mt-1 text-xs text-red-600">{msg.error}</span>}
    </span>
  );
}
