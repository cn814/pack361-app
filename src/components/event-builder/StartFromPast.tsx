"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import ActionForm, { Field } from "@/components/ActionForm";
import { copyPlanFrom } from "@/app/(app)/events/build-actions";
import { plural } from "./BuildParts";

export interface SourceOption {
  id: string;
  label: string;
  schedule: number;
  packing: number;
  sections: number;
  links: number;
}

const PARTS = [
  ["schedule", "Schedule", "moved to this event's dates, same days and times"],
  ["packing", "Packing list", ""],
  ["sections", "Info sections", ""],
  ["links", "Links", ""],
] as const;

/** Copy the schedule, packing list, sections and links from another event, then adjust. */
export default function StartFromPast({
  eventId,
  sources,
  has,
}: {
  eventId: string;
  sources: SourceOption[];
  /** What this event already has, so copying over it asks first. */
  has: { schedule: number; packing: number; sections: number; links: number };
}) {
  const [from, setFrom] = useState(sources[0]?.id ?? "");
  const src = sources.find((s) => s.id === from);
  const empty = has.schedule + has.packing + has.sections + has.links === 0;
  if (!sources.length) return null;
  return (
    <details className="card scroll-mt-20 space-y-3" id="start" open={empty}>
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 font-extrabold text-pine-950">
        <Copy className="h-4 w-4 text-pine" aria-hidden /> Start from a past campout or event
      </summary>
      <p className="pt-2 text-sm text-muted">Copy what another event had, then change what&apos;s different this time.</p>
      <ActionForm
        action={copyPlanFrom}
        submit="Copy"
        busy="Copying…"
        resetOnSuccess={false}
        confirm={empty ? undefined : "What you tick replaces what this event has now for those parts. Copy?"}
      >
        <input type="hidden" name="event_id" value={eventId} />
        <Field label="Copy from">
          <select className="input" name="from_id" value={from} onChange={(e) => setFrom(e.target.value)}>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        {src && (
          <fieldset className="space-y-1">
            <legend className="text-xs font-bold text-navy">What to copy</legend>
            {PARTS.map(([key, label, hint]) => {
              const n = src[key];
              const mine = has[key];
              return (
                <label
                  key={`${src.id}:${key}`}
                  className={`flex min-h-10 items-start gap-2 py-1 text-sm ${n ? "text-navy" : "text-muted"}`}
                >
                  <input
                    type="checkbox"
                    name="parts"
                    value={key}
                    defaultChecked={n > 0}
                    disabled={!n}
                    className="mt-0.5 h-4 w-4 accent-pine"
                  />
                  <span>
                    {label}: {n ? plural(n, key === "sections" ? "section" : key === "links" ? "link" : "item") : "none"}
                    {n > 0 && hint && <span className="block text-xs text-muted">{hint}</span>}
                    {n > 0 && mine > 0 && <span className="block text-xs text-gold-800">Replaces the {mine} this event has now.</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}
      </ActionForm>
    </details>
  );
}
