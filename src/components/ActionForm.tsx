"use client";
import { useFormStatus } from "react-dom";
import { useActionState, useTransition, useState } from "react";
import { Loader2 } from "lucide-react";

type State = { ok?: string; error?: string } | null;

export function ActionForm({ action, children, className, submit = "Save", submitClass = "btn-primary" }: { action: (s: State, fd: FormData) => Promise<State>; children: React.ReactNode; className?: string; submit?: string | null; submitClass?: string }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
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
  return (
    <span className="inline-flex flex-col">
      <button
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirmText && !confirm(confirmText)) return;
          start(async () => setMsg(await action()));
        }}
      >
        {pending && <Loader2 size={13} className="animate-spin" />} {label}
      </button>
      {msg?.error && <span className="mt-1 text-xs text-red-600">{msg.error}</span>}
    </span>
  );
}
