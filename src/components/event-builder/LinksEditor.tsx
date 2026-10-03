"use client";

import { useState } from "react";
import { ExternalLink, Plus } from "lucide-react";
import ActionForm, { Field } from "@/components/ActionForm";
import { changeLink, saveLink } from "@/app/(app)/events/build-actions";
import type { EventLink } from "@/lib/types";
import { BuildHeading, CancelEdit, RowButtons, RowError, plural } from "./BuildParts";

/** Links: sign-up pages, forms, maps. Families open them from the event page. */
export default function LinksEditor({ eventId, links }: { eventId: string; links: EventLink[] }) {
  return (
    <section aria-labelledby="b-links" className="card scroll-mt-20 space-y-3" id="links">
      <BuildHeading id="b-links" title="Links" count={links.length ? plural(links.length, "link") : undefined}>
        Sign-up pages, forms, maps and apps to download.
      </BuildHeading>
      {links.length === 0 && <p className="rounded-xl bg-surface-low p-3 text-sm text-muted">No links yet.</p>}
      <ul className="space-y-2">
        {links.map((l, i) => (
          <LinkRow key={`${i}:${l.url}`} eventId={eventId} link={l} index={i} count={links.length} />
        ))}
      </ul>
      <details className="rounded-xl border border-line p-3" open={links.length === 0}>
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm font-bold text-pine">
          <Plus className="h-4 w-4" aria-hidden /> Add a link
        </summary>
        <div className="pt-2">
          <LinkForm eventId={eventId} />
        </div>
      </details>
    </section>
  );
}

function LinkRow({ eventId, link, index, count }: { eventId: string; link: EventLink; index: number; count: number }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fields = { event_id: eventId, index: String(index), match: link.url };
  if (editing) {
    return (
      <li className="rounded-xl border border-pine/40 p-3">
        <LinkForm eventId={eventId} v={link} edit={fields} onSaved={() => setEditing(false)} />
        <CancelEdit onClick={() => setEditing(false)} />
      </li>
    );
  }
  return (
    <li className="space-y-1 rounded-xl border border-line p-3">
      <div>
        <span className="flex min-w-0 items-start gap-2">
          <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-pine" aria-hidden />
          <span className="min-w-0 flex-1">
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm font-bold text-pine underline-offset-2 hover:underline"
            >
              {link.label}
            </a>
            <span className="block truncate text-xs text-muted">{link.url.replace(/^https:\/\//, "")}</span>
            {link.note && <span className="block text-xs text-muted">{link.note}</span>}
          </span>
        </span>
        <RowButtons
          action={changeLink}
          moveFields={(dir) => ({ op: dir })}
          fields={fields}
          deleteFields={{ ...fields, op: "delete" }}
          deleteAction={changeLink}
          name={link.label}
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

function LinkForm({
  eventId,
  v = {},
  edit,
  onSaved,
}: {
  eventId: string;
  v?: Partial<EventLink>;
  edit?: Record<string, string>;
  onSaved?: () => void;
}) {
  return (
    <ActionForm
      action={saveLink}
      submit={edit ? "Save" : "Add link"}
      busy={edit ? "Saving…" : "Adding…"}
      resetOnSuccess={!edit}
      onSuccess={onSaved}
    >
      <input type="hidden" name="event_id" value={eventId} />
      {edit && Object.entries(edit).map(([k, val]) => k !== "event_id" && <input key={k} type="hidden" name={k} value={val} />)}
      <Field label="Name">
        <input
          className="input"
          name="label"
          required
          maxLength={120}
          defaultValue={v.label ?? ""}
          placeholder="Sign up and pay (Givebutter)"
        />
      </Field>
      <Field label="Web address" hint="Starts with https://">
        <input
          className="input"
          type="url"
          inputMode="url"
          name="url"
          required
          maxLength={500}
          defaultValue={v.url ?? ""}
          placeholder="https://"
          autoCapitalize="none"
          autoCorrect="off"
        />
      </Field>
      <Field label="Note (optional)">
        <input
          className="input"
          name="note"
          maxLength={300}
          defaultValue={v.note ?? ""}
          placeholder="By Fri, Oct 16. One form per family."
        />
      </Field>
    </ActionForm>
  );
}
