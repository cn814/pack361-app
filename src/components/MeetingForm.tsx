"use client";

import { useActionState, useState } from "react";
import { CircleCheck } from "lucide-react";
import type { ActionResult } from "@/components/ActionForm";
import type { DenMeeting } from "@/lib/meetings";

export interface AdventureOption {
  name: string;
  req_count: number;
  required: boolean;
  /** How many scouts in the den still need it (for suggestions). */
  missing: number;
}

/** Plan or edit a den meeting: date, adventure, and which requirements it covers. */
export default function MeetingForm({
  action,
  denId,
  adventures,
  meeting,
  defaultDate,
  defaultStart,
  defaultEnd,
  defaultLocation,
}: {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  denId: string;
  adventures: AdventureOption[];
  meeting?: DenMeeting;
  defaultDate?: string;
  defaultStart?: string;
  defaultEnd?: string;
  defaultLocation?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, {});
  const [adventure, setAdventure] = useState(meeting?.adventure ?? "");
  const [reqs, setReqs] = useState<string[]>(meeting?.requirements ?? []);
  const adv = adventures.find((a) => a.name === adventure);
  const suggested = adventures.filter((a) => a.required && a.missing > 0).sort((a, b) => b.missing - a.missing).slice(0, 3);

  return (
    <form action={formAction} className="space-y-3">
      {meeting && <input type="hidden" name="id" value={meeting.id} />}
      <input type="hidden" name="den_id" value={denId} />
      <label className="block space-y-1">
        <span className="text-xs font-bold text-navy">Date</span>
        <input className="input" type="date" name="meets_on" required defaultValue={meeting?.meets_on ?? defaultDate} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-xs font-bold text-navy">Starts</span>
          <input className="input" type="time" name="start_time" defaultValue={meeting?.start_time?.slice(0, 5) ?? defaultStart ?? ""} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold text-navy">Ends</span>
          <input className="input" type="time" name="end_time" defaultValue={meeting?.end_time?.slice(0, 5) ?? defaultEnd ?? ""} />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-bold text-navy">Where</span>
        <input className="input" name="location" defaultValue={meeting?.location ?? defaultLocation ?? ""} placeholder="Church room 4, or a place name" />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-bold text-navy">Address (for off-site meetings)</span>
        <input className="input" name="address" defaultValue={meeting?.address ?? ""} placeholder="Street, town" />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-bold text-navy">Adventure</span>
        <select
          className="input"
          name="adventure"
          value={adventure}
          onChange={(e) => {
            setAdventure(e.target.value);
            const next = adventures.find((a) => a.name === e.target.value);
            setReqs(next ? Array.from({ length: next.req_count }, (_, i) => String(i + 1)) : []);
          }}
        >
          <option value="">No adventure (activity or outing)</option>
          <optgroup label="Required">
            {adventures
              .filter((a) => a.required)
              .map((a) => (
                <option key={a.name} value={a.name}>
                  {a.name}
                  {a.missing ? ` (${a.missing} still need it)` : " (whole den done)"}
                </option>
              ))}
          </optgroup>
          <optgroup label="Electives">
            {adventures
              .filter((a) => !a.required)
              .map((a) => (
                <option key={a.name} value={a.name}>
                  {a.name}
                </option>
              ))}
          </optgroup>
        </select>
      </label>
      {!meeting && !adventure && suggested.length > 0 && (
        <p className="text-xs text-muted">
          Most needed:{" "}
          {suggested.map((a, i) => (
            <span key={a.name}>
              {i > 0 && ", "}
              <button
                type="button"
                className="font-semibold text-pine underline"
                onClick={() => {
                  setAdventure(a.name);
                  setReqs(Array.from({ length: a.req_count }, (_, n) => String(n + 1)));
                }}
              >
                {a.name}
              </button>{" "}
              ({a.missing})
            </span>
          ))}
        </p>
      )}

      {adv && (
        <fieldset className="space-y-1">
          <legend className="text-xs font-bold text-navy">Requirements this meeting covers</legend>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: adv.req_count }, (_, i) => String(i + 1)).map((r) => {
              const on = reqs.includes(r);
              return (
                <label
                  key={r}
                  className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border-[1.5px] text-sm font-bold ${
                    on ? "border-pine bg-pine text-white" : "border-line bg-white text-navy"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="requirement"
                    value={r}
                    checked={on}
                    onChange={() => setReqs(on ? reqs.filter((x) => x !== r) : [...reqs, r])}
                    className="sr-only"
                  />
                  {r}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <label className="block space-y-1">
        <span className="text-xs font-bold text-navy">Title (optional)</span>
        <input className="input" name="title" defaultValue={meeting?.title ?? ""} placeholder={adventure || "Den meeting"} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-bold text-navy">Note for families (optional)</span>
        <textarea
          className="input min-h-20"
          name="family_note"
          defaultValue={meeting?.family_note ?? ""}
          placeholder="Wear your uniform and bring a flashlight."
        />
      </label>

      <button className={`btn-primary w-full ${pending ? "is-busy" : ""}`} disabled={pending}>
        {pending ? "Saving…" : meeting ? "Save meeting" : "Plan meeting"}
      </button>
      {state.error && !pending && <p className="text-sm font-semibold text-danger">{state.error}</p>}
      {state.ok && !pending && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-pine">
          <CircleCheck className="h-4 w-4" aria-hidden /> Saved
        </p>
      )}
    </form>
  );
}
