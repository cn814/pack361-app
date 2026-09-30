"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import ActionForm, { Field } from "@/components/ActionForm";
import { createPoll } from "@/app/(app)/polls/actions";

/** Leaders: start a poll. */
export default function PollForm({ dens, canPollPack }: { dens: { id: string; name: string }[]; canPollPack: boolean }) {
  const [options, setOptions] = useState(["", ""]);
  return (
    <ActionForm action={createPoll} submit="Start the poll" busy="Starting…">
      <Field label="Question">
        <input className="input" name="question" required maxLength={200} placeholder="Which weekend works for the spring campout?" />
      </Field>
      <Field label="More details (optional)">
        <textarea className="input min-h-16" name="details" maxLength={1000} />
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-xs font-bold text-navy">Answers to pick from</legend>
        {options.map((o, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="input flex-1"
              name="option"
              value={o}
              maxLength={120}
              required={i < 2}
              placeholder={`Answer ${i + 1}`}
              onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {options.length > 2 && (
              <button
                type="button"
                aria-label={`Remove answer ${i + 1}`}
                className="btn-ghost px-3"
                onClick={() => setOptions(options.filter((_, j) => j !== i))}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        ))}
        {options.length < 10 && (
          <button type="button" className="text-xs font-bold text-pine underline" onClick={() => setOptions([...options, ""])}>
            <Plus className="inline h-3.5 w-3.5" aria-hidden /> Add an answer
          </button>
        )}
      </fieldset>
      <Field label="Who's asked">
        <select className="input" name="den_id" defaultValue={canPollPack ? "" : dens[0]?.id}>
          {canPollPack && <option value="">Whole pack</option>}
          {dens.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} families
            </option>
          ))}
        </select>
      </Field>
      <Field label="Closes (optional)" hint="Open through the end of that day. Leave blank to close it yourself.">
        <input className="input" type="date" name="closes_on" />
      </Field>
      <div className="space-y-2 text-sm text-navy">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="allow_multiple" className="h-4 w-4 accent-pine" /> People can pick more than one answer
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="one_per_family" className="h-4 w-4 accent-pine" /> One answer per family (a second parent&apos;s
          answer replaces the first)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="results_visible" value="leaders" className="h-4 w-4 accent-pine" /> Only leaders see the results
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="notify" defaultChecked className="h-4 w-4 accent-pine" /> Send a phone alert to the people asked
        </label>
      </div>
    </ActionForm>
  );
}
