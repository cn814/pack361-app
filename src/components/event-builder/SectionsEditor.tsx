"use client";

import { useState } from "react";
import { Info, ListChecks, Plus, TriangleAlert } from "lucide-react";
import ActionForm, { Field } from "@/components/ActionForm";
import { changeSection, saveSection } from "@/app/(app)/events/build-actions";
import type { EventSection } from "@/lib/types";
import { BuildHeading, CancelEdit, RowButtons, RowError, plural } from "./BuildParts";

const TONES = [
  ["", "Plain"],
  ["info", "Good to know (gold)"],
  ["warn", "Important (red)"],
] as const;

/** Info sections: a title, some text and bullet items, shown as cards on the event page. */
export default function SectionsEditor({ eventId, sections }: { eventId: string; sections: EventSection[] }) {
  return (
    <section aria-labelledby="b-sections" className="card scroll-mt-20 space-y-3" id="sections">
      <BuildHeading id="b-sections" title="Info sections" count={sections.length ? plural(sections.length, "section") : undefined}>
        Cards on the event page: the basics, rules, what to expect, a scavenger hunt.
      </BuildHeading>
      {sections.length === 0 && <p className="rounded-xl bg-surface-low p-3 text-sm text-muted">No sections yet.</p>}
      <ul className="space-y-2">
        {sections.map((s, i) => (
          <SectionRow key={`${i}:${s.title}`} eventId={eventId} section={s} index={i} count={sections.length} />
        ))}
      </ul>
      <details className="rounded-xl border border-line p-3" open={sections.length === 0}>
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm font-bold text-pine">
          <Plus className="h-4 w-4" aria-hidden /> Add a section
        </summary>
        <div className="pt-2">
          <SectionForm eventId={eventId} />
        </div>
      </details>
    </section>
  );
}

function SectionRow({ eventId, section, index, count }: { eventId: string; section: EventSection; index: number; count: number }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fields = { event_id: eventId, index: String(index), match: section.title };
  if (editing) {
    return (
      <li className="rounded-xl border border-pine/40 p-3">
        <SectionForm eventId={eventId} v={section} edit={fields} onSaved={() => setEditing(false)} />
        <CancelEdit onClick={() => setEditing(false)} />
      </li>
    );
  }
  const tone = section.tone === "warn" ? "border-l-4 border-l-danger" : section.tone === "info" ? "border-l-4 border-l-gold" : "";
  const Icon = section.tone === "warn" ? TriangleAlert : section.tone === "info" ? Info : null;
  const items = section.items ?? [];
  return (
    <li className={`space-y-1 rounded-xl border border-line p-3 ${tone}`}>
      <div>
        <span className="block min-w-0">
          <span className={`flex items-center gap-1.5 text-sm font-extrabold ${section.tone === "warn" ? "text-danger" : "text-pine-950"}`}>
            {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
            {section.title}
          </span>
          {section.body && <span className="line-clamp-2 block text-xs text-muted">{section.body}</span>}
          {items.length > 0 && (
            <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-navy">
              {section.check && <ListChecks className="h-3.5 w-3.5" aria-hidden />}
              {section.check ? `Tap-to-check list, ${plural(items.length, "item")}` : plural(items.length, "bullet item")}
            </span>
          )}
        </span>
        <RowButtons
          action={changeSection}
          moveFields={(dir) => ({ op: dir })}
          fields={fields}
          deleteFields={{ ...fields, op: "delete" }}
          deleteAction={changeSection}
          name={section.title}
          first={index === 0}
          last={index === count - 1}
          onEdit={() => setEditing(true)}
          onError={setError}
          className="-mb-2 -mr-2 justify-end"
        />
      </div>
      <RowError error={error} />
    </li>
  );
}

function SectionForm({
  eventId,
  v = {},
  edit,
  onSaved,
}: {
  eventId: string;
  v?: Partial<EventSection>;
  /** index and match of the section being changed; none when adding. */
  edit?: Record<string, string>;
  onSaved?: () => void;
}) {
  const [check, setCheck] = useState(Boolean(v.check));
  return (
    <ActionForm
      action={saveSection}
      submit={edit ? "Save" : "Add section"}
      busy={edit ? "Saving…" : "Adding…"}
      resetOnSuccess={!edit}
      onSuccess={() => {
        setCheck(false);
        onSaved?.();
      }}
    >
      <input type="hidden" name="event_id" value={eventId} />
      {edit && Object.entries(edit).map(([k, val]) => k !== "event_id" && <input key={k} type="hidden" name={k} value={val} />)}
      <Field label="Title">
        <input
          className="input"
          name="title"
          required
          maxLength={120}
          defaultValue={v.title ?? ""}
          placeholder="Closed-toe shoes, always"
        />
      </Field>
      <fieldset className="space-y-1">
        <legend className="text-xs font-bold text-navy">Look</legend>
        <div className="grid gap-1 sm:grid-cols-3">
          {TONES.map(([value, label]) => (
            <label
              key={value}
              className="flex min-h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm text-navy has-[:checked]:border-pine has-[:checked]:bg-mint"
            >
              <input type="radio" name="tone" value={value} defaultChecked={(v.tone ?? "") === value} className="h-4 w-4 accent-pine" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Text (optional)">
        <textarea
          className="input min-h-24"
          name="body"
          maxLength={3000}
          defaultValue={v.body ?? ""}
          placeholder="Everyone needs sturdy shoes with no holes."
        />
      </Field>
      <Field label={check ? "Things to check off, one per line" : "Bullet items, one per line (optional)"}>
        <textarea
          className="input min-h-32"
          name="items"
          defaultValue={(v.items ?? []).join("\n")}
          placeholder={check ? "A red leaf\nAn acorn\nA pinecone" : "Arrive Friday from 5:30 PM\nLeave by 10:00 AM Sunday"}
        />
      </Field>
      <label className="flex min-h-10 items-start gap-2 text-sm text-navy">
        <input
          type="checkbox"
          name="check"
          checked={check}
          onChange={(e) => setCheck(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-pine"
        />
        <span>
          Tap-to-check list
          <span className="block text-xs text-muted">
            Families tick items off on their phone, like a scavenger hunt. Works without signal.
          </span>
        </span>
      </label>
    </ActionForm>
  );
}
