"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import type { ActionResult } from "./ActionForm";
import { useSubmitKeepingValues } from "./ActionForm";
import { GRADES, GRADE_LABEL, MAX_JOIN_SCOUTS } from "@/lib/join";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

/** The "ask to join" form on the not-on-roster page: you, then your scouts. */
export default function JoinForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, {});
  const onSubmit = useSubmitKeepingValues(formAction);
  const [rows, setRows] = useState([0]);
  const [next, setNext] = useState(1);

  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-3 text-left">
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-xs font-bold text-navy">Your first name</span>
          <input className="input" name="first_name" required maxLength={60} autoComplete="given-name" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold text-navy">Last name</span>
          <input className="input" name="last_name" required maxLength={60} autoComplete="family-name" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-xs font-bold text-navy">Phone (optional)</span>
          <input className="input" name="phone" type="tel" maxLength={40} autoComplete="tel" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold text-navy">You are their…</span>
          <select className="input" name="relationship" defaultValue="">
            <option value="">Choose</option>
            <option>Mother</option>
            <option>Father</option>
            <option>Guardian</option>
            <option>Grandparent</option>
            <option>Leader (no scout)</option>
          </select>
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-bold text-navy">Your Cub Scouts</legend>
        {rows.map((key, i) => (
          <div key={key} className="flex items-start gap-1.5">
            <div className="grid flex-1 grid-cols-[1fr_1fr_7.5rem] gap-1.5">
              <input className="input py-2 text-sm" name="scout_first" placeholder="First name" aria-label={`Scout ${i + 1} first name`} maxLength={60} />
              <input className="input py-2 text-sm" name="scout_last" placeholder="Last name" aria-label={`Scout ${i + 1} last name`} maxLength={60} />
              <select className="input py-2 text-sm" name="scout_grade" defaultValue="" aria-label={`Scout ${i + 1} grade this school year`}>
                <option value="">Grade</option>
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {GRADE_LABEL[g]}
                  </option>
                ))}
              </select>
            </div>
            {rows.length > 1 && (
              <button type="button" className="mt-2 text-muted" aria-label={`Remove scout ${i + 1}`} onClick={() => setRows(rows.filter((r) => r !== key))}>
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        ))}
        {rows.length < MAX_JOIN_SCOUTS && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm font-semibold text-pine"
            onClick={() => {
              setRows([...rows, next]);
              setNext(next + 1);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden /> Another scout
          </button>
        )}
        <p className="text-[11px] text-muted">Grade this school year. Just names and grades: nothing else about your children.</p>
      </fieldset>

      <label className="block space-y-1">
        <span className="text-xs font-bold text-navy">Anything we should know? (optional)</span>
        <textarea className="input min-h-16" name="note" maxLength={1000} placeholder="For example: we joined at the open house, or my spouse is already on the roster" />
      </label>

      <button className={`btn-primary w-full ${pending ? "is-busy" : ""}`} disabled={pending}>
        {pending ? "Sending…" : "Ask to join"}
      </button>
      {state.error && !pending && <p className="text-sm font-semibold text-danger">{state.error}</p>}
    </form>
  );
}
