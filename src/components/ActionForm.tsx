"use client";

import { useActionState, type ReactNode } from "react";
import { CircleCheck } from "lucide-react";

export type ActionResult = { ok?: boolean; error?: string; message?: string };
type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

/** A form wired to a server action, with a busy button and a saved / error message. */
export default function ActionForm({
  action,
  children,
  submit = "Save",
  busy = "Saving…",
  className = "space-y-3",
  buttonClass = "btn-primary w-full",
  confirm,
}: {
  action: Action;
  children?: ReactNode;
  submit?: ReactNode;
  busy?: string;
  className?: string;
  buttonClass?: string;
  /** Ask before submitting (e.g. "Send 40 emails?"). */
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, {});
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <button className={`${buttonClass} ${pending ? "is-busy" : ""}`} disabled={pending}>
        {pending ? busy : submit}
      </button>
      {state.error && !pending && <p className="text-sm font-semibold text-danger">{state.error}</p>}
      {state.ok && !pending && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-pine">
          <CircleCheck className="h-4 w-4" aria-hidden /> {state.message ?? "Saved"}
        </p>
      )}
    </form>
  );
}

/** Labeled field wrapper used by admin forms. */
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold text-navy">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}
