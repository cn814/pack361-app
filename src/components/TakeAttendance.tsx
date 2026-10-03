"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Check, CircleCheck, ClipboardCheck, Pencil } from "lucide-react";
import type { ActionResult } from "@/components/ActionForm";
import type { AttendanceGroup } from "@/lib/attendance";
import { recordEventAttendance } from "@/app/(app)/events/actions";

type Result = ActionResult & { count?: number };

interface Props {
  eventId: string;
  groups: AttendanceGroup[];
  present: string[];
  taken: boolean;
  /** "Checked from 4 families that said yes" when nothing is saved yet. */
  note: string | null;
  hasFocus: boolean;
}

const wereThere = (n: number) => (n === 1 ? "1 scout was there" : `${n} scouts were there`);

/** Leaders, from the event's day on: tap who came, Save. Collapsed once it's saved. */
export default function TakeAttendance(p: Props) {
  const [state, formAction, pending] = useActionState<Result, FormData>(recordEventAttendance, {});
  const [present, setPresent] = useState<Set<string>>(new Set(p.present));
  const [open, setOpen] = useState(!p.taken);
  const [lastOk, setLastOk] = useState<Result | null>(null);
  const [saved, setSaved] = useState<string[]>(p.taken ? p.present : []);
  const focusIds = new Set(p.groups.filter((g) => g.focus).flatMap((g) => g.scouts.map((s) => s.id)));
  const [showAll, setShowAll] = useState(!p.hasFocus || p.present.some((id) => !focusIds.has(id)));
  if (state.ok && state !== lastOk) {
    setLastOk(state);
    setSaved([...present]);
    setOpen(false);
  }

  const savedCount = lastOk?.count ?? saved.length;
  const visible = showAll || !p.hasFocus ? p.groups : p.groups.filter((g) => g.focus);
  const visibleIds = visible.flatMap((g) => g.scouts.map((s) => s.id));
  const allVisibleOn = visibleIds.length > 0 && visibleIds.every((id) => present.has(id));
  const focusNames = p.groups.filter((g) => g.focus).map((g) => g.name);

  const toggle = (id: string) =>
    setPresent((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return; // a second tap while saving does nothing
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  };

  if (!open) {
    return (
      <section className="card flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-pine">
        <div className="min-w-0">
          <h2 className="section-title flex items-center gap-1.5">
            <ClipboardCheck className="h-4 w-4" aria-hidden /> Attendance
          </h2>
          <p className="flex items-center gap-1.5 text-base font-bold text-pine">
            <CircleCheck className="h-5 w-5 shrink-0" aria-hidden /> {wereThere(savedCount)}
          </p>
        </div>
        <button type="button" className="btn-ghost py-2" onClick={() => setOpen(true)}>
          <Pencil className="h-4 w-4" aria-hidden /> Change
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-3 border-t-4 border-t-pine">
      <input type="hidden" name="event_id" value={p.eventId} />
      {[...present].map((id) => (
        <input key={id} type="hidden" name="scout" value={id} />
      ))}
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-lg font-extrabold text-pine-950">
          <ClipboardCheck className="h-5 w-5" aria-hidden /> Take attendance
        </h2>
        <span className="badge bg-gold-50 text-gold-800" aria-live="polite">
          {present.size} here
        </span>
      </div>
      <p className="text-sm text-navy">Tap each scout who came, then Save.</p>
      {p.note && <p className="text-xs text-muted">{p.note}</p>}

      {visible.map((g) => (
        <div key={g.key} className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted">
            {g.name} <span className="font-semibold normal-case tracking-normal">({g.scouts.filter((s) => present.has(s.id)).length} of {g.scouts.length})</span>
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {g.scouts.map((s) => {
              const on = present.has(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(s.id)}
                  className={`flex min-h-14 items-center gap-2 rounded-2xl border-2 px-3 py-3 text-left text-base font-bold ${
                    on ? "border-pine bg-brand text-white" : "border-line bg-card text-navy"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-white bg-white text-brand" : "border-outline"}`}
                    aria-hidden
                  >
                    {on && <Check className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 truncate">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {p.groups.length === 0 && <p className="text-sm text-muted">No scouts on the roster yet.</p>}

      {p.hasFocus && (
        <button type="button" className="text-sm font-semibold text-pine underline" onClick={() => setShowAll((v) => !v)}>
          {showAll ? `Show only ${focusNames.join(" and ") || "this event's dens"}` : "Show all scouts"}
        </button>
      )}
      {visibleIds.length > 0 && (
        <button
          type="button"
          className="btn-ghost w-full py-3 text-base"
          onClick={() =>
            setPresent((cur) => {
              const next = new Set(cur);
              for (const id of visibleIds) {
                if (allVisibleOn) next.delete(id);
                else next.add(id);
              }
              return next;
            })
          }
        >
          {allVisibleOn ? "Clear everyone" : "Everyone was here"}
        </button>
      )}

      <button className={`btn-primary w-full py-3 text-base ${pending ? "is-busy" : ""}`} disabled={pending}>
        {pending ? "Saving…" : `Save (${present.size})`}
      </button>
      {(p.taken || lastOk) && !pending && (
        <button
          type="button"
          className="w-full text-sm font-semibold text-muted underline"
          onClick={() => {
            setPresent(new Set(saved));
            setOpen(false);
          }}
        >
          Cancel
        </button>
      )}
      {state.error && !pending && <p className="text-sm font-semibold text-danger">{state.error}</p>}
    </form>
  );
}
