"use client";

import { useState } from "react";
import ActionForm, { Field } from "@/components/ActionForm";
import { EVENT_CATEGORIES } from "@/components/EventForm";
import { addCouncilEvent } from "@/app/(app)/events/council/actions";

const RANKS = [
  ["lion", "Lions"],
  ["tiger", "Tigers"],
  ["wolf", "Wolves"],
  ["bear", "Bears"],
  ["webelos", "Webelos"],
  ["aol", "AOL"],
] as const;

/** Leaders: the small form that puts a council event on the pack calendar. */
export default function CouncilAddForm({
  uid,
  title,
  category,
  dens,
}: {
  uid: string;
  title: string;
  category: string;
  dens: { id: string; name: string }[];
}) {
  const [den, setDen] = useState("");
  return (
    <ActionForm action={addCouncilEvent} submit="Add to our calendar" busy="Adding…" className="space-y-3 pt-3">
      <input type="hidden" name="uid" value={uid} />
      <Field label="Name on our calendar">
        <input className="input" name="title" required maxLength={200} defaultValue={title.slice(0, 200)} />
      </Field>
      <Field label="Kind of event">
        <select className="input" name="category" defaultValue={category}>
          {EVENT_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <fieldset className="space-y-2 rounded-xl border border-line p-3">
        <legend className="px-1 text-xs font-bold text-navy">Who it&apos;s for</legend>
        <select className="input" name="den_id" value={den} onChange={(e) => setDen(e.target.value)}>
          <option value="">Whole pack (or the ranks ticked below)</option>
          {dens.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} only
            </option>
          ))}
        </select>
        {!den && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-navy">
            {RANKS.map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5">
                <input type="checkbox" name="ranks" value={k} className="h-4 w-4 accent-pine" /> {label}
              </label>
            ))}
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-navy">
          <input type="checkbox" name="leaders_only" className="h-4 w-4 accent-pine" /> Leaders only (like Roundtable or a training)
        </label>
      </fieldset>
      <Field label="Note for families (optional)" hint="Shown above the council's description.">
        <textarea className="input min-h-20" name="note" maxLength={1500} placeholder="Who's going from the pack, carpooling, how to register" />
      </Field>
    </ActionForm>
  );
}
