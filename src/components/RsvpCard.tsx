"use client";

import { useState } from "react";
import { CalendarCheck, CircleCheck, Hourglass } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import ChargeLine, { type EventCharge } from "@/components/ChargeLine";
import { setRsvp } from "@/app/(app)/events/actions";

interface Props {
  eventId: string;
  open: boolean;
  deadline: string | null;
  mine: {
    status: "yes" | "maybe" | "no";
    scouts: number;
    adults: number;
    siblings?: number;
    note: string | null;
    /** Filled in from the family's Givebutter sign-up. */
    fromGivebutter?: boolean;
    /** Said yes while it was full: on the waitlist. */
    waitlisted?: boolean;
    /** Place in line (1 = next in). */
    waitlist_spot?: number | null;
  } | null;
  counts: {
    families_yes: number;
    families_maybe: number;
    scouts: number;
    adults: number;
    siblings?: number;
    families_waitlist?: number;
    /** Most people (scouts, siblings and adults) who can come; null = no limit. */
    rsvp_limit?: number | null;
  };
  defaultScouts: number;
  hasFamily: boolean;
  /** "$10 per family + $25 per scout", or null when the event is free. */
  cost?: string | null;
  /** The viewer's charge for this event, if they owe (or paid) something. */
  charge?: EventCharge | null;
}

const LABEL = { yes: "Going", maybe: "Maybe", no: "Can't go" } as const;

/** RSVP for an event: yes / maybe / no, with how many scouts, siblings and adults are coming. */
export default function RsvpCard({ eventId, open, deadline, mine, counts, defaultScouts, hasFamily, cost, charge }: Props) {
  const [status, setStatus] = useState<"yes" | "maybe" | "no" | "">(mine?.status ?? "");
  const [editing, setEditing] = useState(!mine);
  // After a save the card folds back to "Your answer", with the thank-you under it.
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const limit = counts.rsvp_limit ?? null;
  const left = limit == null ? null : Math.max(limit - counts.scouts - counts.adults - (counts.siblings ?? 0), 0);
  const mineCount = mine ? mine.scouts + mine.adults + (mine.siblings ?? 0) : 0;
  const waiting = counts.families_waitlist ?? 0;
  // Already in (said yes, not waiting): they can grow into the spots left.
  const inNow = mine?.status === "yes" && !mine.waitlisted;
  const full = left !== null && (left === 0 || waiting > 0);
  return (
    <section id="rsvp" className="card scroll-mt-20 space-y-3 border-l-4 border-l-gold">
      <h2 className="section-title flex items-center gap-1.5">
        <CalendarCheck className="h-4 w-4" aria-hidden /> RSVP
      </h2>
      <p className="text-sm text-muted">
        <b className="text-ink">{counts.families_yes}</b> {counts.families_yes === 1 ? "family" : "families"} going ({counts.scouts} scout
        {counts.scouts === 1 ? "" : "s"}, {counts.siblings ? `${counts.siblings} sibling${counts.siblings === 1 ? "" : "s"}, ` : ""}
        {counts.adults} adult{counts.adults === 1 ? "" : "s"})
        {counts.families_maybe ? ` · ${counts.families_maybe} maybe` : ""}
        {deadline ? ` · RSVP by ${deadline}` : ""}
      </p>
      {left !== null && (
        <p className={`text-sm font-semibold ${full ? "text-gold-800" : "text-pine"}`}>
          {full ? "Full" : `${left} ${left === 1 ? "spot" : "spots"} left`}
          <span className="font-normal text-muted">
            {" "}
            · room for {limit} {limit === 1 ? "person" : "people"}
            {waiting ? ` · ${waiting} ${waiting === 1 ? "family" : "families"} on the waitlist` : ""}
          </span>
        </p>
      )}
      {cost && (
        <p className="text-sm text-ink">
          <b>Cost:</b> {cost}
          {!charge && open ? <span className="block text-xs text-muted">Answer yes and you can pay right in the app.</span> : null}
        </p>
      )}
      <ChargeLine charge={charge ?? null} />

      {mine && !editing ? (
        <div className="space-y-1.5">
          <div
            className={`flex items-center justify-between gap-2 rounded-xl p-3 text-sm ${
              mine.waitlisted ? "bg-gold-50 text-gold-800" : "bg-mint text-pine"
            }`}
          >
            <span>
              {mine.waitlisted ? (
                <b className="flex items-center gap-1.5">
                  <Hourglass className="h-4 w-4 shrink-0" aria-hidden /> Full: you&apos;re on the waitlist
                  {mine.waitlist_spot ? ` (#${mine.waitlist_spot})` : ""}
                </b>
              ) : (
                <b>Your answer: {LABEL[mine.status]}</b>
              )}
              {mine.status !== "no" && (
                <span className="block text-xs">
                  {hasFamily ? `${mine.scouts} scout${mine.scouts === 1 ? "" : "s"}, ` : ""}
                  {mine.siblings ? `${mine.siblings} sibling${mine.siblings === 1 ? "" : "s"}, ` : ""}
                  {mine.adults} adult{mine.adults === 1 ? "" : "s"}
                  {mine.note ? ` · “${mine.note}”` : ""}
                </span>
              )}
              {mine.fromGivebutter && (
                <span className="block text-xs">From your Givebutter sign-up. Bringing someone else? Tap Change.</span>
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
          {mine.waitlisted && (
            <p className="text-xs text-muted">We&apos;ll send you an alert if a spot opens. Nothing to pay unless you get in.</p>
          )}
          {savedNote && !mine.waitlisted && (
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
            <div className={`grid gap-2 ${hasFamily ? "grid-cols-3" : "grid-cols-1"}`}>
              {hasFamily && (
                <label className="block space-y-1">
                  <span className="text-xs font-bold text-navy">Scouts</span>
                  <input className="input" type="number" name="scouts" min={0} max={20} defaultValue={mine?.scouts ?? defaultScouts} />
                </label>
              )}
              {hasFamily && (
                <label className="block space-y-1">
                  <span className="text-xs font-bold text-navy">Siblings</span>
                  <input className="input" type="number" name="siblings" min={0} max={20} defaultValue={mine?.siblings ?? 0} />
                </label>
              )}
              <label className="block space-y-1">
                <span className="text-xs font-bold text-navy">Adults</span>
                <input className="input" type="number" name="adults" min={0} max={20} defaultValue={mine?.adults ?? 1} />
              </label>
            </div>
          )}
          {status === "yes" && left !== null && (
            <p className={`rounded-lg p-2.5 text-xs ${full && !inNow ? "bg-gold-50 text-gold-800" : "bg-surface text-muted"}`}>
              {mine?.waitlisted
                ? "You keep your place on the waitlist. Fewer people can help you fit when a spot opens."
                : inNow
                  ? `You can bring up to ${left + mineCount} ${left + mineCount === 1 ? "person" : "people"} in all.`
                  : full
                    ? "It's full. Say Going and you'll join the waitlist; we'll let you know if a spot opens."
                    : `${left} ${left === 1 ? "spot" : "spots"} left. If your group doesn't fit, you'll go on the waitlist.`}
            </p>
          )}
          <input className="input" name="note" maxLength={300} defaultValue={mine?.note ?? ""} placeholder="Note for leaders (optional): arriving late, food allergies…" />
        </ActionForm>
      ) : (
        <p className="text-sm text-muted">RSVPs are closed.{mine ? "" : " Contact a leader if you'd still like to come."}</p>
      )}

    </section>
  );
}
