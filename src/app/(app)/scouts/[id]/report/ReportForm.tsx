"use client";

import { useSubmitKeepingValues, guardAction } from "@/components/ActionForm";
import { useActionState, useState } from "react";
import { reportRequirements, type FormState } from "../../actions";
import type { DenRank } from "@/lib/types";

export interface ReportAdventure {
  name: string;
  required: boolean;
  special: boolean;
  reqCount: number;
  finished: boolean;
  done: string[]; // requirement numbers already in Scoutbook or reported
}

export default function ReportForm({
  scoutId,
  rank,
  adventures,
  today,
}: {
  scoutId: string;
  rank: DenRank;
  adventures: ReportAdventure[];
  today: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(guardAction(reportRequirements), {});
  const keep = useSubmitKeepingValues(action);
  const [name, setName] = useState("");
  const adv = adventures.find((a) => a.name === name);
  const open = (list: ReportAdventure[]) => list.filter((a) => !a.finished);

  return (
    <form action={action} onSubmit={keep} className="card space-y-4">
      <input type="hidden" name="scout_id" value={scoutId} />
      <input type="hidden" name="rank" value={rank} />

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-navy">Adventure</span>
        <select name="adventure" required value={name} onChange={(e) => setName(e.target.value)} className="input">
          <option value="" disabled>
            Choose an adventure
          </option>
          <optgroup label="Required">
            {open(adventures.filter((a) => a.required)).map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Electives">
            {open(adventures.filter((a) => !a.required)).map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
                {a.special ? " (council events)" : ""}
              </option>
            ))}
          </optgroup>
        </select>
      </label>

      {adv && (
        <fieldset key={adv.name}>
          <legend className="mb-1 text-xs font-semibold text-navy">Requirements finished (numbers from the handbook)</legend>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: adv.reqCount }, (_, i) => String(i + 1)).map((n) => {
              const done = adv.done.includes(n);
              return (
                <label
                  key={n}
                  className={`flex h-12 items-center justify-center rounded-xl border-[1.5px] text-base font-bold has-[:checked]:border-pine has-[:checked]:bg-brand has-[:checked]:text-white ${
                    done ? "border-line bg-surface text-outline" : "border-outline bg-card text-navy"
                  }`}
                >
                  <input type="checkbox" name="requirement" value={n} disabled={done} className="sr-only" />
                  {n}
                </label>
              );
            })}
          </div>
          {adv.done.length > 0 && <p className="mt-1 text-[11px] text-muted">Grayed out = already reported or in Scoutbook.</p>}
        </fieldset>
      )}

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-navy">Date finished</span>
        <input type="date" name="completed_on" required defaultValue={today} max={today} className="input" />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-navy">Note for the den leader (optional)</span>
        <textarea name="notes" rows={2} maxLength={1000} className="input" placeholder="What did your scout do?" />
      </label>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending || !adv}>
        {pending ? "Sending…" : "Send to den leader"}
      </button>
    </form>
  );
}
