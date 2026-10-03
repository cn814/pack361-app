"use client";

import { useActionState, useState } from "react";
import { CircleCheck } from "lucide-react";
import { guardAction, useSubmitKeepingValues, type ActionResult } from "@/components/ActionForm";
import { updateGearLoan } from "@/app/(app)/gear/actions";

const guarded = guardAction(updateGearLoan);

/**
 * A leader's buttons on one gear request: approve or decline it, mark it picked up, check it
 * back in, or move the bring-back day.
 */
export default function GearLoanActions({
  id,
  status,
  dueOn,
  today,
}: {
  id: string;
  status: "requested" | "approved" | "out";
  dueOn: string;
  today: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(guarded, {});
  const onSubmit = useSubmitKeepingValues(formAction);
  const [mode, setMode] = useState<"" | "decline" | "due">("");
  const [pressed, setPressed] = useState("");

  const btn = (value: string, label: string, cls: string) => (
    <button
      name="do"
      value={value}
      className={`${cls} min-h-10 ${pending && pressed === value ? "is-busy" : ""}`}
      disabled={pending}
      onClick={() => setPressed(value)}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      {mode === "decline" && (
        <label className="block space-y-1">
          <span className="text-xs font-bold text-navy">Note to the family (optional)</span>
          <input className="input py-2" name="leader_note" maxLength={300} placeholder="e.g. Both tents are out that weekend" />
        </label>
      )}
      {mode === "due" && (
        <label className="block space-y-1">
          <span className="text-xs font-bold text-navy">New bring-back day</span>
          <input className="input py-2" type="date" name="due_on" defaultValue={dueOn} min={today} required />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {mode === "decline" ? (
          <>
            {btn("decline", "Decline request", "btn-ghost flex-1 border-danger py-2 text-danger")}
            <button type="button" className="min-h-10 px-3 text-sm font-bold text-muted underline" onClick={() => setMode("")}>
              Back
            </button>
          </>
        ) : mode === "due" ? (
          <>
            {btn("due", "Save day", "btn-primary flex-1 py-2")}
            <button type="button" className="min-h-10 px-3 text-sm font-bold text-muted underline" onClick={() => setMode("")}>
              Back
            </button>
          </>
        ) : status === "requested" ? (
          <>
            {btn("approve", "Approve", "btn-primary flex-1 py-2")}
            {btn("out", "Picked up now", "btn-ghost flex-1 py-2")}
            <button type="button" className="min-h-10 px-3 text-sm font-bold text-danger underline" onClick={() => setMode("decline")}>
              Decline
            </button>
          </>
        ) : status === "approved" ? (
          <>
            {btn("out", "Mark picked up", "btn-primary flex-1 py-2")}
            <button type="button" className="min-h-10 px-3 text-sm font-bold text-danger underline" onClick={() => setMode("decline")}>
              Decline
            </button>
          </>
        ) : (
          <>
            {btn("returned", "Mark returned", "btn-primary flex-1 py-2")}
            <button type="button" className="min-h-10 px-3 text-sm font-bold text-navy underline" onClick={() => setMode("due")}>
              More time
            </button>
          </>
        )}
      </div>
      {state.error && !pending && <p className="text-sm font-semibold text-danger">{state.error}</p>}
      {state.ok && !pending && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-pine">
          <CircleCheck className="h-4 w-4" aria-hidden /> {state.message}
        </p>
      )}
    </form>
  );
}
