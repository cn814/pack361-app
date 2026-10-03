"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, type FormEvent, type ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { CircleCheck } from "lucide-react";

export type ActionResult = { ok?: boolean; error?: string; message?: string };
type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

/** "No connection. Nothing was lost; tap Save again." */
export const noConnection = (again = "Save") => `No connection. Nothing was lost; tap ${again} again.`;
const serverFailed = (again = "Save") => `Something went wrong on our end. Nothing was lost; tap ${again} again in a minute.`;

/**
 * Message for a server call that threw instead of returning a result. Next's redirects and
 * not-found signals are rethrown so they still navigate. A dropped connection (the usual
 * cause on a phone) rejects with a plain fetch error; a crash on the server carries a digest.
 * `again` names the button to tap again.
 */
export function failedCallMessage(e: unknown, again?: string): string {
  unstable_rethrow(e);
  const digest = typeof e === "object" && e !== null && "digest" in e ? (e as { digest?: unknown }).digest : undefined;
  const online = typeof navigator === "undefined" || navigator.onLine;
  return typeof digest === "string" && online ? serverFailed(again) : noConnection(again);
}

/**
 * Wraps a useActionState action so a rejected call (dropped signal mid-save) comes back as an
 * error result instead of throwing to the full-screen error page. The form keeps its values.
 */
export function guardAction<S extends ActionResult>(action: (prev: S, form: FormData) => Promise<S>, again?: string) {
  return async (prev: S, form: FormData): Promise<S> => {
    try {
      return await action(prev, form);
    } catch (e) {
      return { ...prev, ok: false, message: undefined, error: failedCallMessage(e, again) } as S;
    }
  };
}

/** A form wired to a server action, with a busy button and a saved / error message. */
export default function ActionForm({
  action,
  children,
  submit = "Save",
  busy = "Saving…",
  className = "space-y-3",
  buttonClass = "btn-primary w-full",
  confirm,
  resetOnSuccess = true,
  onSuccess,
}: {
  action: Action;
  children?: ReactNode;
  submit?: ReactNode;
  busy?: string;
  className?: string;
  buttonClass?: string;
  /** Ask before submitting (e.g. "Send 40 emails?"). */
  confirm?: string;
  /** Clear the fields after a successful save. Turn off for forms whose fields are
   *  React-controlled (a DOM reset would show different values than React holds). */
  resetOnSuccess?: boolean;
  /** Called once after each successful save, with the result. */
  onSuccess?: (result: ActionResult) => void;
}) {
  const again = typeof submit === "string" ? submit : undefined;
  const guarded = useMemo(() => guardAction(action, again), [action, again]);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(guarded, {});
  const form = useRef<HTMLFormElement>(null);
  const onSubmit = useSubmitKeepingValues(formAction, confirm);
  // Clear the form only after a successful save; on an error, what was typed stays put.
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });
  useEffect(() => {
    if (!state.ok) return;
    if (resetOnSuccess) form.current?.reset();
    onSuccessRef.current?.(state);
    // Only when a new result arrives, not when the parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form ref={form} action={formAction} className={className} onSubmit={onSubmit}>
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

/**
 * Submit handler that runs the action without React's automatic form reset, which would
 * otherwise wipe what the person typed when the save fails. Pair it with an action wrapped in
 * guardAction() so a dropped connection shows an error instead of the full-screen error page.
 */
export function useSubmitKeepingValues(formAction: (fd: FormData) => void, confirm?: string) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => formAction(fd));
  };
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
