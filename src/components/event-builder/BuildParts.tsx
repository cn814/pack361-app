"use client";

import { useActionState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { guardAction, useSubmitKeepingValues, type ActionResult } from "@/components/ActionForm";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

/**
 * A round 40px icon button that sends a small form (delete, move up, move down). Errors go to
 * `onError` so the row can show them under itself; a later success clears them.
 */
export function IconAction({
  action,
  fields,
  label,
  children,
  confirm,
  disabled,
  onError,
}: {
  action: Action;
  fields: Record<string, string>;
  label: string;
  children: ReactNode;
  confirm?: string;
  disabled?: boolean;
  onError?: (error: string | null) => void;
}) {
  const guarded = useMemo(() => guardAction(action, label), [action, label]);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(guarded, {});
  const onSubmit = useSubmitKeepingValues(formAction, confirm);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });
  useEffect(() => {
    if (state.ok || state.error) onErrorRef.current?.(state.error ?? null);
  }, [state]);
  return (
    <form action={formAction} onSubmit={onSubmit} className="shrink-0">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button
        type="submit"
        aria-label={label}
        title={label}
        disabled={disabled || pending}
        className={`flex h-10 w-10 items-center justify-center rounded-full text-muted transition active:bg-surface disabled:opacity-30 ${pending ? "is-busy" : ""}`}
      >
        {!pending && children}
      </button>
    </form>
  );
}

/** Up / down / edit / delete buttons for one row of a list a leader is building. */
export function RowButtons({
  action,
  fields,
  name,
  first,
  last,
  onEdit,
  onError,
  deleteAction,
  deleteFields,
  moveFields,
  confirmDelete,
  className = "-mr-2 -mt-2",
}: {
  /** Move action (gets `dir` or `op` up/down added by moveFields). Omit for lists kept in time order. */
  action?: Action;
  fields: Record<string, string>;
  name: string;
  first?: boolean;
  last?: boolean;
  onEdit: () => void;
  onError: (error: string | null) => void;
  deleteAction: Action;
  deleteFields?: Record<string, string>;
  moveFields?: (dir: "up" | "down") => Record<string, string>;
  confirmDelete?: string;
  className?: string;
}) {
  return (
    <div className={`flex shrink-0 items-center ${className}`}>
      {action && moveFields && (
        <>
          <IconAction
            action={action}
            fields={{ ...fields, ...moveFields("up") }}
            label={`Move “${name}” up`}
            disabled={first}
            onError={onError}
          >
            <ChevronUp className="h-5 w-5" aria-hidden />
          </IconAction>
          <IconAction
            action={action}
            fields={{ ...fields, ...moveFields("down") }}
            label={`Move “${name}” down`}
            disabled={last}
            onError={onError}
          >
            <ChevronDown className="h-5 w-5" aria-hidden />
          </IconAction>
        </>
      )}
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Change “${name}”`}
        title="Change"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-pine transition active:bg-surface"
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </button>
      <IconAction
        action={deleteAction}
        fields={deleteFields ?? fields}
        label={`Delete “${name}”`}
        confirm={confirmDelete ?? `Delete “${name}”?`}
        onError={onError}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </IconAction>
    </div>
  );
}

/** The error a row's buttons ran into, shown under the row. */
export function RowError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm font-semibold text-danger">
      {error}
    </p>
  );
}

/** A "Cancel" link under an edit form. */
export function CancelEdit({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-10 w-full items-center justify-center text-sm font-bold text-muted">
      Cancel
    </button>
  );
}

/** Card heading for one part of the builder, with a short count. */
export function BuildHeading({ id, title, count, children }: { id: string; title: string; count?: string; children?: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={id} className="text-lg font-extrabold text-pine-950">
          {title}
        </h2>
        {count && <span className="text-xs font-semibold text-muted">{count}</span>}
      </div>
      {children && <p className="text-sm text-muted">{children}</p>}
    </div>
  );
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
