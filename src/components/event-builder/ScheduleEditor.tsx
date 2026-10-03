"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import ActionForm, { Field } from "@/components/ActionForm";
import { deleteScheduleItem, saveScheduleItem } from "@/app/(app)/events/build-actions";
import { BuildHeading, CancelEdit, RowButtons, RowError, plural } from "./BuildParts";

export interface ScheduleRow {
  id: string;
  /** Eastern YYYY-MM-DD and HH:MM, for the edit form. */
  date: string;
  time: string;
  dayLabel: string;
  timeLabel: string;
  title: string;
  location: string | null;
  notes: string | null;
}

export interface DayOption {
  value: string;
  label: string;
}

/** Schedule: kept in time order, grouped by day like families see it. */
export default function ScheduleEditor({ eventId, items, days }: { eventId: string; items: ScheduleRow[]; days: DayOption[] }) {
  const byDay = new Map<string, ScheduleRow[]>();
  for (const i of items) byDay.set(i.dayLabel, [...(byDay.get(i.dayLabel) ?? []), i]);
  return (
    <section aria-labelledby="b-schedule" className="card scroll-mt-20 space-y-3" id="schedule">
      <BuildHeading id="b-schedule" title="Schedule" count={plural(items.length, "item")}>
        What happens when. It&apos;s kept in time order for you.
      </BuildHeading>
      {items.length === 0 && <p className="rounded-xl bg-surface-low p-3 text-sm text-muted">Nothing on the schedule yet.</p>}
      {[...byDay.entries()].map(([day, list]) => (
        <div key={day} className="space-y-2">
          <h3 className="section-title">{day}</h3>
          <ul className="space-y-2">
            {list.map((i) => (
              <ScheduleItem key={i.id} eventId={eventId} item={i} days={days} />
            ))}
          </ul>
        </div>
      ))}
      <details className="group rounded-xl border border-line p-3" open={items.length === 0}>
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm font-bold text-pine">
          <Plus className="h-4 w-4" aria-hidden /> Add to the schedule
        </summary>
        <div className="pt-2">
          <ScheduleForm eventId={eventId} days={days} v={{}} onSaved={() => {}} />
        </div>
      </details>
    </section>
  );
}

function ScheduleItem({ eventId, item, days }: { eventId: string; item: ScheduleRow; days: DayOption[] }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (editing) {
    return (
      <li className="rounded-xl border border-pine/40 p-3">
        <ScheduleForm eventId={eventId} days={days} v={item} onSaved={() => setEditing(false)} />
        <CancelEdit onClick={() => setEditing(false)} />
      </li>
    );
  }
  return (
    <li className="space-y-1 rounded-xl border border-line p-3">
      <div className="flex items-start gap-3">
        <span className="w-16 shrink-0 pt-0.5 text-xs font-bold text-gold-800">{item.timeLabel}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{item.title}</span>
          {(item.location || item.notes) && (
            <span className="block text-xs text-muted">{[item.location, item.notes].filter(Boolean).join(" · ")}</span>
          )}
        </span>
        <RowButtons
          fields={{ event_id: eventId, id: item.id }}
          name={item.title}
          onEdit={() => setEditing(true)}
          onError={setError}
          deleteAction={deleteScheduleItem}
        />
      </div>
      <RowError error={error} />
    </li>
  );
}

function ScheduleForm({ eventId, days, v, onSaved }: { eventId: string; days: DayOption[]; v: Partial<ScheduleRow>; onSaved: () => void }) {
  const known = days.some((d) => d.value === v.date);
  const [other, setOther] = useState(Boolean(v.date) && !known);
  const [date, setDate] = useState(v.date ?? days[0]?.value ?? "");
  const fields = useRef<HTMLDivElement>(null);
  return (
    <ActionForm
      action={saveScheduleItem}
      submit={v.id ? "Save" : "Add"}
      busy={v.id ? "Saving…" : "Adding…"}
      resetOnSuccess={false}
      onSuccess={() => {
        // Adding several in a row: keep the day picked, clear the rest for the next one.
        if (!v.id)
          fields.current
            ?.querySelectorAll("input:not([type=hidden]):not([name=date])")
            .forEach((i) => ((i as HTMLInputElement).value = ""));
        onSaved();
      }}
    >
      <input type="hidden" name="event_id" value={eventId} />
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <div ref={fields} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Day">
            {other || days.length === 0 ? (
              <input className="input" type="date" name="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            ) : (
              <select
                className="input"
                name="date"
                value={date}
                onChange={(e) => {
                  if (e.target.value === "other") setOther(true);
                  else setDate(e.target.value);
                }}
              >
                {days.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
                <option value="other">Another day…</option>
              </select>
            )}
          </Field>
          <Field label="Time">
            <input className="input" type="time" name="time" required defaultValue={v.time ?? ""} />
          </Field>
        </div>
        <Field label="What's happening">
          <input
            className="input"
            name="title"
            required
            maxLength={200}
            defaultValue={v.title ?? ""}
            placeholder="Campfire with skits and songs"
          />
        </Field>
        <Field label="Where (optional)">
          <input className="input" name="location" maxLength={200} defaultValue={v.location ?? ""} placeholder="Fire ring" />
        </Field>
        <Field label="Note (optional)">
          <input className="input" name="notes" maxLength={1000} defaultValue={v.notes ?? ""} placeholder="Bring a flashlight" />
        </Field>
      </div>
    </ActionForm>
  );
}
