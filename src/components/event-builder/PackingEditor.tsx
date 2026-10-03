"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import ActionForm, { Field } from "@/components/ActionForm";
import { deletePackingItem, movePacking, savePackingItem, startPackingFromStandard } from "@/app/(app)/events/build-actions";
import { packingGroups } from "@/lib/event-builder";
import type { PackingItem } from "@/lib/types";
import { BuildHeading, CancelEdit, IconAction, RowButtons, RowError, plural } from "./BuildParts";

/** Packing list: grouped like families see it; items and whole groups move up and down. */
export default function PackingEditor({
  eventId,
  items,
  campout,
  standardCount,
}: {
  eventId: string;
  items: PackingItem[];
  campout: boolean;
  /** Items on the pack's standard campout list (campouts without their own list show it). */
  standardCount: number;
}) {
  const groups = packingGroups(items);
  const categories = groups.map(([c]) => c);
  const [groupError, setGroupError] = useState<string | null>(null);
  return (
    <section aria-labelledby="b-packing" className="card scroll-mt-20 space-y-3" id="packing">
      <BuildHeading id="b-packing" title="Packing list" count={items.length ? plural(items.length, "item") : undefined}>
        Families tick these off on their phone. Changing an item keeps their ticks.
      </BuildHeading>
      {items.length === 0 &&
        (campout && standardCount > 0 ? (
          <div className="space-y-2 rounded-xl bg-gold-50 p-3 text-sm text-gold-800">
            <p>
              Families see the pack&apos;s standard campout list ({plural(standardCount, "item")}) until this campout has its own. Start
              from the standard list and change it here. Families who already ticked items will need to tick them again.
            </p>
            <ActionForm
              action={startPackingFromStandard}
              submit="Start from the standard list"
              busy="Copying…"
              buttonClass="btn-ghost w-full"
            >
              <input type="hidden" name="event_id" value={eventId} />
            </ActionForm>
          </div>
        ) : (
          <p className="rounded-xl bg-surface-low p-3 text-sm text-muted">
            No packing list yet. {campout ? "" : "It shows on the event page once you add something."}
          </p>
        ))}
      {groups.map(([cat, list], g) => (
        <div key={cat} className="space-y-2">
          <div className="flex items-center gap-1">
            <h3 className="section-title flex-1">{cat}</h3>
            {groups.length > 1 && (
              <div className="-mr-2 flex">
                <IconAction
                  action={movePacking}
                  fields={{ event_id: eventId, category: cat, dir: "up" }}
                  label={`Move the group “${cat}” up`}
                  disabled={g === 0}
                  onError={setGroupError}
                >
                  <ChevronUp className="h-5 w-5" aria-hidden />
                </IconAction>
                <IconAction
                  action={movePacking}
                  fields={{ event_id: eventId, category: cat, dir: "down" }}
                  label={`Move the group “${cat}” down`}
                  disabled={g === groups.length - 1}
                  onError={setGroupError}
                >
                  <ChevronDown className="h-5 w-5" aria-hidden />
                </IconAction>
              </div>
            )}
          </div>
          <ul className="space-y-2">
            {list.map((i, n) => (
              <PackingRow key={i.id} eventId={eventId} item={i} first={n === 0} last={n === list.length - 1} categories={categories} />
            ))}
          </ul>
        </div>
      ))}
      <RowError error={groupError} />
      <details className="rounded-xl border border-line p-3" open={items.length === 0 && !(campout && standardCount > 0)}>
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm font-bold text-pine">
          <Plus className="h-4 w-4" aria-hidden /> Add to the packing list
        </summary>
        <div className="pt-2">
          {items.length === 0 && campout && standardCount > 0 && (
            <p className="pb-2 text-xs text-muted">Adding an item starts this campout&apos;s own list in place of the standard one.</p>
          )}
          <PackingForm eventId={eventId} categories={categories} v={{ category: categories[categories.length - 1] ?? "" }} />
        </div>
      </details>
    </section>
  );
}

function PackingRow({
  eventId,
  item,
  first,
  last,
  categories,
}: {
  eventId: string;
  item: PackingItem;
  first: boolean;
  last: boolean;
  categories: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (editing) {
    return (
      <li className="rounded-xl border border-pine/40 p-3">
        <PackingForm eventId={eventId} categories={categories} v={item} onSaved={() => setEditing(false)} />
        <CancelEdit onClick={() => setEditing(false)} />
      </li>
    );
  }
  return (
    <li className="space-y-1 rounded-xl border border-line p-3">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 pt-1">
          <span className="block text-sm font-semibold text-ink">{item.label}</span>
          {item.detail && <span className="block text-xs text-muted">{item.detail}</span>}
        </span>
        <RowButtons
          action={movePacking}
          moveFields={(dir) => ({ dir })}
          fields={{ event_id: eventId, id: item.id }}
          name={item.label}
          first={first}
          last={last}
          onEdit={() => setEditing(true)}
          onError={setError}
          deleteAction={deletePackingItem}
        />
      </div>
      <RowError error={error} />
    </li>
  );
}

function PackingForm({
  eventId,
  categories,
  v,
  onSaved,
}: {
  eventId: string;
  categories: string[];
  v: Partial<PackingItem>;
  onSaved?: () => void;
}) {
  const fields = useRef<HTMLDivElement>(null);
  const listId = `packing-groups-${v.id ?? "new"}`;
  return (
    <ActionForm
      action={savePackingItem}
      submit={v.id ? "Save" : "Add"}
      busy={v.id ? "Saving…" : "Adding…"}
      resetOnSuccess={false}
      onSuccess={() => {
        // Adding several to the same group: keep the group, clear the item.
        if (!v.id)
          fields.current?.querySelectorAll("input[name=label], input[name=detail]").forEach((i) => ((i as HTMLInputElement).value = ""));
        onSaved?.();
      }}
    >
      <input type="hidden" name="event_id" value={eventId} />
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <div ref={fields} className="space-y-3">
        <Field
          label="Group"
          hint={categories.length ? "Pick one from the list, or type a new group." : "Like “Sleeping”, “Clothes” or “Every scout carries”."}
        >
          <input
            className="input"
            name="category"
            required
            maxLength={60}
            list={listId}
            defaultValue={v.category ?? ""}
            placeholder="Sleeping"
          />
          <datalist id={listId}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Item">
          <input className="input" name="label" required maxLength={200} defaultValue={v.label ?? ""} placeholder="Sleeping bag" />
        </Field>
        <Field label="Note (optional)">
          <input className="input" name="detail" maxLength={300} defaultValue={v.detail ?? ""} placeholder="Rated for 30°F or colder" />
        </Field>
      </div>
    </ActionForm>
  );
}
