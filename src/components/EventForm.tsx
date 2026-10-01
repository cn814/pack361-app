"use client";

import { useState } from "react";
import ActionForm, { Field } from "@/components/ActionForm";
import { saveEvent } from "@/app/(app)/events/actions";
import { centsToInput } from "@/lib/money";

export const EVENT_CATEGORIES = [
  "Pack Meeting",
  "Den Meeting",
  "Campout",
  "Pack",
  "Den",
  "Service",
  "Fundraiser",
  "Committee",
  "Leaders",
  "District",
  "Council",
];

const RANKS = [
  ["lion", "Lions"],
  ["tiger", "Tigers"],
  ["wolf", "Wolves"],
  ["bear", "Bears"],
  ["webelos", "Webelos"],
  ["aol", "AOL"],
] as const;

export interface EventFormValues {
  id?: string;
  title?: string;
  category?: string;
  start_date?: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  all_day?: boolean;
  location_name?: string | null;
  address?: string | null;
  details?: string | null;
  signup_url?: string | null;
  den_id?: string | null;
  ranks?: string[] | null;
  rsvp_enabled?: boolean;
  rsvp_by?: string | null;
  fee_family_cents?: number | null;
  fee_scout_cents?: number | null;
  fee_adult_cents?: number | null;
  from_twh?: boolean;
}

/** Leaders: add or edit an event. */
export default function EventForm({ v = {}, dens }: { v?: EventFormValues; dens: { id: string; name: string }[] }) {
  const [allDay, setAllDay] = useState(Boolean(v.all_day));
  const [rsvp, setRsvp] = useState(Boolean(v.rsvp_enabled));
  const [den, setDen] = useState(v.den_id ?? "");
  const [cost, setCost] = useState(v.fee_family_cents != null || v.fee_scout_cents != null || v.fee_adult_cents != null);
  return (
    <ActionForm action={saveEvent} submit={v.id ? "Save event" : "Add event"}>
      {v.id && <input type="hidden" name="id" value={v.id} />}
      {v.from_twh && (
        <p className="rounded-xl bg-gold-50 p-3 text-xs text-gold-800">
          This event came from TroopWebHost. Once you save it here, the app keeps your version and TroopWebHost no longer changes it.
        </p>
      )}
      <Field label="Event name">
        <input className="input" name="title" required maxLength={200} defaultValue={v.title} placeholder="Fall Campout at Broad Creek" />
      </Field>
      <Field label="Kind of event" hint="Campouts get their own page with a schedule and packing list.">
        <select className="input" name="category" defaultValue={v.category ?? "Pack"}>
          {EVENT_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <label className="flex items-center gap-2 text-sm font-semibold text-navy">
        <input type="checkbox" name="all_day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4 accent-pine" />
        All day (or several days, like a campout)
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Starts">
          <input className="input" type="date" name="start_date" required defaultValue={v.start_date} />
        </Field>
        {!allDay && (
          <Field label="Time">
            <input className="input" type="time" name="start_time" defaultValue={v.start_time ?? "18:30"} />
          </Field>
        )}
        <Field label="Ends" hint="Blank = same day">
          <input className="input" type="date" name="end_date" defaultValue={v.end_date} />
        </Field>
        {!allDay && (
          <Field label="Time">
            <input className="input" type="time" name="end_time" defaultValue={v.end_time ?? ""} />
          </Field>
        )}
      </div>
      <Field label="Where">
        <input className="input" name="location_name" maxLength={200} defaultValue={v.location_name ?? ""} placeholder="First Presbyterian Church of Howard County" />
      </Field>
      <Field label="Address (for directions)">
        <input className="input" name="address" maxLength={300} defaultValue={v.address ?? ""} />
      </Field>
      <Field label="Details for families">
        <textarea className="input min-h-28" name="details" maxLength={5000} defaultValue={v.details ?? ""} placeholder="What to bring, what to wear, who to contact" />
      </Field>
      <Field label="Sign-up or payment link (optional)" hint="A Givebutter or SignUpGenius link, if there is one.">
        <input className="input" type="url" name="signup_url" maxLength={500} defaultValue={v.signup_url ?? ""} placeholder="https://" />
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
                <input type="checkbox" name="ranks" value={k} defaultChecked={v.ranks?.includes(k)} className="h-4 w-4 accent-pine" /> {label}
              </label>
            ))}
            <p className="w-full text-[11px] text-muted">Tick ranks only if it&apos;s just for them (like a Webelos outing). None ticked = everyone.</p>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-2 rounded-xl border border-line p-3">
        <legend className="px-1 text-xs font-bold text-navy">RSVP</legend>
        <label className="flex items-center gap-2 text-sm text-navy">
          <input type="checkbox" name="rsvp_enabled" checked={rsvp} onChange={(e) => setRsvp(e.target.checked)} className="h-4 w-4 accent-pine" />
          Ask families to RSVP in the app (with how many scouts and adults)
        </label>
        {rsvp && (
          <Field label="RSVP by (optional)" hint="Families can answer through the end of this day.">
            <input className="input" type="date" name="rsvp_by" defaultValue={v.rsvp_by ?? ""} />
          </Field>
        )}
      </fieldset>

      <fieldset className="space-y-2 rounded-xl border border-line p-3">
        <legend className="px-1 text-xs font-bold text-navy">Cost</legend>
        <label className="flex items-center gap-2 text-sm text-navy">
          <input type="checkbox" name="has_cost" checked={cost} onChange={(e) => setCost(e.target.checked)} className="h-4 w-4 accent-pine" />
          This event costs money
        </label>
        {cost && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Per scout">
                <input className="input" inputMode="decimal" name="fee_scout" defaultValue={centsToInput(v.fee_scout_cents)} placeholder="$" />
              </Field>
              <Field label="Per adult">
                <input className="input" inputMode="decimal" name="fee_adult" defaultValue={centsToInput(v.fee_adult_cents)} placeholder="$" />
              </Field>
              <Field label="Per family">
                <input className="input" inputMode="decimal" name="fee_family" defaultValue={centsToInput(v.fee_family_cents)} placeholder="$" />
              </Field>
            </div>
            <p className="text-[11px] text-muted">
              In dollars; leave a box empty if it doesn&apos;t apply (0 means free for them). With RSVPs on, a family that answers yes
              owes family + scouts × scout price + adults × adult price, and can pay in the app. Changing the cost updates what
              families owe, unless they&apos;ve already paid.
            </p>
          </>
        )}
      </fieldset>
    </ActionForm>
  );
}
