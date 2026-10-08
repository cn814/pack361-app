"use client";

import { useState } from "react";
import ActionForm, { Field } from "@/components/ActionForm";
import { saveEvent } from "@/app/(app)/events/actions";
import { centsToInput } from "@/lib/money";
import { asksForNights, nightsBetween } from "@/lib/attendance";
import { DEFAULT_SLIP_TEXT } from "@/lib/slips";
import { MAX_REPEATS, monthlyLabel, repeatDates, type Repeat } from "@/lib/event-builder";

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
  /** Only for these scouts (null = everyone the den or ranks cover). */
  only_scouts?: string[] | null;
  rsvp_enabled?: boolean;
  rsvp_by?: string | null;
  fee_family_cents?: number | null;
  fee_scout_cents?: number | null;
  fee_adult_cents?: number | null;
  camping_nights?: number | null;
  public_on_join?: boolean;
  public_blurb?: string | null;
  slip_required?: boolean;
  slip_text?: string | null;
  slip_document_id?: string | null;
  slip_due?: string | null;
  from_twh?: boolean;
  from_council?: boolean;
  /** Most people (scouts, siblings and adults) who can come; null = no limit. */
  rsvp_limit?: number | null;
  carpool?: boolean | null;
  /** Other upcoming events in the same repeating series (editing only). */
  series_upcoming?: number;
  /** Just made with "Copy this event". */
  copied?: boolean;
}

/** Leaders: add or edit an event. */
export default function EventForm({
  v = {},
  dens,
  scouts = [],
  documents = [],
}: {
  v?: EventFormValues;
  dens: { id: string; name: string }[];
  /** Active scouts, for "Only some scouts". */
  scouts?: { id: string; name: string; den_id: string | null; den_name: string | null }[];
  /** Pack documents everyone can see, for attaching a printable permission slip. */
  documents?: { id: string; title: string }[];
}) {
  const [slip, setSlip] = useState(Boolean(v.slip_required));
  const [allDay, setAllDay] = useState(Boolean(v.all_day));
  const [rsvp, setRsvp] = useState(v.rsvp_enabled ?? true); // every event takes RSVPs unless a leader turns it off
  const [den, setDen] = useState(v.den_id ?? "");
  const [onlySome, setOnlySome] = useState(Boolean(v.only_scouts?.length));
  const [picked, setPicked] = useState<Set<string>>(new Set(v.only_scouts ?? []));
  const [cost, setCost] = useState(v.fee_family_cents != null || v.fee_scout_cents != null || v.fee_adult_cents != null);
  const [category, setCategory] = useState(v.category ?? "Pack");
  const [onJoin, setOnJoin] = useState(Boolean(v.public_on_join));
  const [startDate, setStartDate] = useState(v.start_date ?? "");
  const [endDate, setEndDate] = useState(v.end_date ?? "");
  const [repeat, setRepeat] = useState<Repeat>("never");
  const [until, setUntil] = useState("");
  const autoNights = nightsBetween(startDate, endDate || startDate);
  const repeatCount = repeat !== "never" && startDate && until > startDate ? repeatDates(startDate, repeat, until).length : 0;
  return (
    <ActionForm action={saveEvent} submit={v.id ? "Save event" : "Add event"}>
      {v.id && <input type="hidden" name="id" value={v.id} />}
      {v.copied && (
        <p className="rounded-xl bg-mint p-3 text-sm font-semibold text-pine">
          Here&apos;s your copy. Check the date, details and cost, then save.
        </p>
      )}
      {v.from_twh && (
        <p className="rounded-xl bg-gold-50 p-3 text-xs text-gold-800">
          This event came from TroopWebHost. Once you save it here, the app keeps your version and TroopWebHost no longer changes it.
        </p>
      )}
      {v.from_council && (
        <p className="rounded-xl bg-gold-50 p-3 text-xs text-gold-800">
          This event came from the council calendar. Once you save it here, the app keeps your version and changes on the council calendar no
          longer copy over.
        </p>
      )}
      <Field label="Event name">
        <input className="input" name="title" required maxLength={200} defaultValue={v.title} placeholder="Fall Campout at Broad Creek" />
      </Field>
      <Field label="Kind of event" hint="Campouts get their own page with a schedule and packing list.">
        <select className="input" name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
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
          <input className="input" type="date" name="start_date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        {!allDay && (
          <Field label="Time">
            <input className="input" type="time" name="start_time" defaultValue={v.start_time ?? "18:30"} />
          </Field>
        )}
        <Field label="Ends" hint="Blank = same day">
          <input className="input" type="date" name="end_date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
        {!allDay && (
          <Field label="Time">
            <input className="input" type="time" name="end_time" defaultValue={v.end_time ?? ""} />
          </Field>
        )}
      </div>
      {!v.id && (
        <div className="space-y-2">
          <Field label="Repeats">
            <select className="input" name="repeat" value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
              <option value="never">Never (just this once)</option>
              <option value="weekly">Every week</option>
              <option value="biweekly">Every other week</option>
              <option value="monthly">Monthly, on the {startDate ? monthlyLabel(startDate) : "same weekday"}</option>
            </select>
          </Field>
          {repeat !== "never" && (
            <Field
              label="Until"
              hint={
                repeatCount > MAX_REPEATS
                  ? `That's more than ${MAX_REPEATS} events. Pick an earlier date.`
                  : repeatCount > 1
                    ? `Adds ${repeatCount} events. You can change or remove any of them later.`
                    : "The last date it can happen on."
              }
            >
              <input className="input" type="date" name="repeat_until" required min={startDate || undefined} value={until} onChange={(e) => setUntil(e.target.value)} />
            </Field>
          )}
        </div>
      )}
      {asksForNights(category, startDate, endDate) && (
        <Field
          label="Camping nights (optional)"
          hint={`Blank = ${autoNights === 1 ? "1 night" : `${autoNights} nights`} from the dates. Counts toward each scout's camping nights. Put 0 if nobody sleeps over (like day camp).`}
        >
          <input
            className="input w-28"
            type="number"
            name="camping_nights"
            min={0}
            max={14}
            step={1}
            inputMode="numeric"
            defaultValue={v.camping_nights ?? ""}
            placeholder={String(autoNights)}
          />
        </Field>
      )}
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
        {scouts.length > 0 && (
          <div className="space-y-2 border-t border-line pt-2">
            <label className="flex items-start gap-2 text-sm text-navy">
              <input type="checkbox" checked={onlySome} onChange={(e) => setOnlySome(e.target.checked)} className="mt-0.5 h-4 w-4 accent-pine" />
              <span>
                Only some scouts
                <span className="block text-[11px] text-muted">
                  Like the scouts signed up for a workshop. Only their families see it in the app, the Sunday email and their calendar.
                </span>
              </span>
            </label>
            {onlySome && (
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg bg-surface-low p-2">
                {[...new Map(scouts.filter((x) => !den || x.den_id === den).map((x) => [x.den_name ?? "No den", 0])).keys()].map((group) => (
                  <div key={group}>
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted">{group}</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      {scouts
                        .filter((x) => (x.den_name ?? "No den") === group && (!den || x.den_id === den))
                        .map((x) => (
                          <label key={x.id} className="flex items-center gap-1.5 text-sm text-ink">
                            <input
                              type="checkbox"
                              name="only_scouts"
                              value={x.id}
                              checked={picked.has(x.id)}
                              onChange={(e) =>
                                setPicked((old) => {
                                  const next = new Set(old);
                                  if (e.target.checked) next.add(x.id);
                                  else next.delete(x.id);
                                  return next;
                                })
                              }
                              className="h-4 w-4 accent-pine"
                            />
                            {x.name}
                          </label>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {onlySome && <p className="text-[11px] font-semibold text-pine">{picked.size} picked</p>}
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-2 rounded-xl border border-line p-3">
        <legend className="px-1 text-xs font-bold text-navy">RSVP</legend>
        <label className="flex items-center gap-2 text-sm text-navy">
          <input type="checkbox" name="rsvp_enabled" checked={rsvp} onChange={(e) => setRsvp(e.target.checked)} className="h-4 w-4 accent-pine" />
          Ask families to RSVP in the app (with how many scouts, siblings and adults)
        </label>
        {rsvp && (
          <>
            <Field label="RSVP by (optional)" hint="Families can answer through the end of this day.">
              <input className="input" type="date" name="rsvp_by" defaultValue={v.rsvp_by ?? ""} />
            </Field>
            <div className="space-y-1">
              <span className="block text-xs font-bold text-navy">Limit (optional)</span>
              <label className="flex items-center gap-2 text-sm text-navy">
                At most
                <input
                  className="input w-20"
                  type="number"
                  name="rsvp_limit"
                  min={1}
                  max={500}
                  step={1}
                  inputMode="numeric"
                  defaultValue={v.rsvp_limit ?? ""}
                  aria-label="Limit: at most this many people (scouts, siblings and adults)"
                />
                people
              </label>
              <p className="text-[11px] text-muted">Scouts and adults together. Leave blank for no limit.</p>
            </div>
          </>
        )}
      </fieldset>

      <Field label="Carpool board" hint="Families post seats to share or ask for a ride on the event page. Automatic: on when the event has a place, off for regular meetings.">
        <select className="input" name="carpool" defaultValue={v.carpool === true ? "on" : v.carpool === false ? "off" : "auto"}>
          <option value="auto">Automatic</option>
          <option value="on">On</option>
          <option value="off">Off</option>
        </select>
      </Field>

      <fieldset className="space-y-2 rounded-xl border border-line p-3">
        <legend className="px-1 text-xs font-bold text-navy">Permission slip</legend>
        <label className="flex items-center gap-2 text-sm text-navy">
          <input type="checkbox" name="slip_required" checked={slip} onChange={(e) => setSlip(e.target.checked)} className="h-4 w-4 accent-pine" />
          Families sign a permission slip for each scout
        </label>
        {slip && (
          <>
            <Field label="What parents agree to" hint="Parents read this and sign by typing their name. Change it for this event if you need to.">
              <textarea className="input min-h-28" name="slip_text" maxLength={4000} defaultValue={v.slip_text ?? DEFAULT_SLIP_TEXT} required />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Due by (optional)">
                <input className="input" type="date" name="slip_due" defaultValue={v.slip_due ?? ""} />
              </Field>
              <Field label="Printable form (optional)" hint="From Pack documents.">
                <select className="input" name="slip_document_id" defaultValue={v.slip_document_id ?? ""}>
                  <option value="">None</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </>
        )}
      </fieldset>

      <fieldset className="space-y-2 rounded-xl border border-line p-3">
        <legend className="px-1 text-xs font-bold text-navy">Families thinking about joining</legend>
        <label className="flex items-center gap-2 text-sm text-navy">
          <input type="checkbox" name="public_on_join" checked={onJoin} onChange={(e) => setOnJoin(e.target.checked)} className="h-4 w-4 accent-pine" />
          Show on the public join page as an event to come and see
        </label>
        {onJoin && (
          <Field label="A line for visiting families (optional)" hint="Anyone can see this. The join page shows the name, date, place name and this line; never the address or details.">
            <textarea className="input min-h-16" name="public_blurb" maxLength={300} defaultValue={v.public_blurb ?? ""} placeholder="Come watch the race and meet the pack. Kids can try the track afterward." />
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

      {v.id && (v.series_upcoming ?? 0) > 0 && (
        <label className="flex items-start gap-2 rounded-xl border border-line bg-surface-low p-3 text-sm text-navy">
          <input type="checkbox" name="apply_series" className="mt-0.5 h-4 w-4 accent-pine" />
          <span>
            Also change the other {v.series_upcoming === 1 ? "upcoming event" : `${v.series_upcoming} upcoming events`} in this series
            <span className="block text-xs text-muted">Only the name, time, place and details. Each keeps its own date.</span>
          </span>
        </label>
      )}
    </ActionForm>
  );
}
