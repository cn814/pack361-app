"use client";

import { useState } from "react";
import { CalendarCheck, CircleCheck } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import ChargeLine, { type EventCharge } from "@/components/ChargeLine";
import { setRsvp } from "@/app/(app)/events/actions";

interface Props {
  eventId: string;
  open: boolean;
  deadline: string | null;
  mine: { status: "yes" | "maybe" | "no"; scouts: number; adults: number; note: string | null } | null;
  counts: { families_yes: number; families_maybe: number; scouts: number; adults: number };
  defaultScouts: number;
  hasFamily: boolean;
  rows?: { name: string; status: string; scouts: number; adults: number; note: string | null }[];
  /** "$10 per family + $25 per scout", or null when the event is free. */
  cost?: string | null;
  /** The viewer's charge for this event, if they owe (or paid) something. */
  charge?: EventCharge | null;
}

const LABEL = { yes: "Going", maybe: "Maybe", no: "Can't go" } as const;

/** RSVP for an event: yes / maybe / no, with how many scouts and adults are coming. */
export default function RsvpCard({ eventId, open, deadline, mine, counts, defaultScouts, hasFamily, rows, cost, charge }: Props) {
  const [status, setStatus] = useState<"yes" | "maybe" | "no" | "">(mine?.status ?? "");
  const [editing, setEditing] = useState(!mine);
  // After a save the card folds back to "Your answer", with the thank-you under it.
  const [savedNote, setSavedNote] = useState<string | null>(null);
  return (
    <section id="rsvp" className="card scroll-mt-20 space-y-3 border-l-4 border-l-gold">
      <h2 className="section-title flex items-center gap-1.5">
        <CalendarCheck className="h-4 w-4" aria-hidden /> RSVP
      </h2>
      <p className="text-sm text-muted">
        <b className="text-ink">{counts.families_yes}</b> {counts.families_yes === 1 ? "family" : "families"} going ({counts.scouts} scout
        {counts.scouts === 1 ? "" : "s"}, {counts.adults} adult{counts.adults === 1 ? "" : "s"})
        {counts.families_maybe ? ` · ${counts.families_maybe} maybe` : ""}
        {deadline ? ` · RSVP by ${deadline}` : ""}
      </p>
      {cost && (
        <p className="text-sm text-ink">
          <b>Cost:</b> {cost}
          {!charge && open ? <span className="block text-xs text-muted">Answer yes and you can pay right in the app.</span> : null}
        </p>
      )}
      <ChargeLine charge={charge ?? null} />

      {mine && !editing ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 rounded-xl bg-mint p-3 text-sm text-pine">
            <span>
              <b>Your answer: {LABEL[mine.status]}</b>
              {mine.status !== "no" && (
                <span className="block text-xs">
                  {hasFamily ? `${mine.scouts} scout${mine.scouts === 1 ? "" : "s"}, ` : ""}
                  {mine.adults} adult{mine.adults === 1 ? "" : "s"}
                  {mine.note ? ` · “${mine.note}”` : ""}
                </span>
              )}
            </span>
            {open && (
              <button
                type="button"
                className="min-h-10 shrink-0 px-1 text-xs font-bold underline"
                onClick={() => {
                  setSavedNote(null);
                  setEditing(true);
                }}
              >
                Change
              </button>
            )}
          </div>
          {savedNote && (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-pine" role="status">
              <CircleCheck className="h-4 w-4 shrink-0" aria-hidden /> {savedNote}
            </p>
          )}
        </div>
      ) : open ? (
        // No reset after saving: the yes/maybe/no choice is React state, and the card folds
        // up on success anyway.
        <ActionForm
          action={setRsvp}
          submit="Send my RSVP"
          busy="Sending…"
          className="space-y-3"
          resetOnSuccess={false}
          onSuccess={(r) => {
            setSavedNote(r.message ?? "Saved");
            setEditing(false);
          }}
        >
          <input type="hidden" name="event_id" value={eventId} />
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Are you coming?">
            {(["yes", "maybe", "no"] as const).map((s) => (
              <label
                key={s}
                className={`cursor-pointer rounded-xl border p-2.5 text-center text-sm font-bold ${
                  status === s ? "border-pine bg-brand text-white" : "border-line bg-card text-navy"
                }`}
              >
                <input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} className="sr-only" required />
                {LABEL[s]}
              </label>
            ))}
          </div>
          {status && status !== "no" && (
            <div className="grid grid-cols-2 gap-2">
              {hasFamily && (
                <label className="block space-y-1">
                  <span className="text-xs font-bold text-navy">Scouts coming</span>
                  <input className="input" type="number" name="scouts" min={0} max={20} defaultValue={mine?.scouts ?? defaultScouts} />
                </label>
              )}
              <label className="block space-y-1">
                <span className="text-xs font-bold text-navy">Adults coming</span>
                <input className="input" type="number" name="adults" min={0} max={20} defaultValue={mine?.adults ?? 1} />
              </label>
            </div>
          )}
          <input className="input" name="note" maxLength={300} defaultValue={mine?.note ?? ""} placeholder="Note for leaders (optional): siblings, arriving late…" />
        </ActionForm>
      ) : (
        <p className="text-sm text-muted">RSVPs are closed.{mine ? "" : " Contact a leader if you'd still like to come."}</p>
      )}

      {rows && rows.length > 0 && (
        <details className="border-t border-line pt-2">
          <summary className="cursor-pointer text-xs font-bold text-pine">Who&apos;s coming (leaders only)</summary>
          <ul className="divide-y divide-line pt-1 text-sm">
            {rows.map((r, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-1.5">
                <span className="min-w-0">
                  <span className="font-semibold text-ink">{r.name}</span>
                  {r.note && <span className="block text-xs text-muted">“{r.note}”</span>}
                </span>
                <span className="shrink-0 text-right text-xs text-muted">
                  <b className={r.status === "yes" ? "text-pine" : r.status === "maybe" ? "text-gold-800" : "text-muted"}>
                    {LABEL[r.status as keyof typeof LABEL]}
                  </b>
                  {r.status !== "no" && <span className="block">{r.scouts} scouts · {r.adults} adults</span>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
