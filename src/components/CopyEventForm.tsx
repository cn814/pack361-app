"use client";

import { CopyPlus } from "lucide-react";
import ActionForm, { Field } from "@/components/ActionForm";
import { copyEvent } from "@/app/(app)/events/build-actions";

/** "Copy this event": pick a date, get a new event with the same details, then fix what's different. */
export default function CopyEventForm({ eventId, costDropped }: { eventId: string; costDropped: boolean }) {
  return (
    <details className="rounded-xl border-[1.5px] border-pine bg-card">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-center gap-2 px-4 py-2 text-sm font-bold text-pine">
        <CopyPlus className="h-4 w-4" aria-hidden /> Copy this event
      </summary>
      <div className="space-y-2 px-4 pb-4">
        <p className="text-xs text-muted">
          Makes a new event on the date you pick with the same details, cost, permission slip, schedule, packing list, info and links, and
          volunteer jobs. Times and deadlines move with it. RSVPs, sign-ups and the Signal group start fresh.
        </p>
        {costDropped && (
          <p className="rounded-xl bg-gold-50 p-2 text-xs text-gold-800">The cost isn&apos;t copied: only pack leadership sets prices.</p>
        )}
        <ActionForm action={copyEvent} submit="Make the copy" busy="Copying…" resetOnSuccess={false}>
          <input type="hidden" name="event_id" value={eventId} />
          <Field label="New start date">
            <input className="input" type="date" name="date" required />
          </Field>
        </ActionForm>
      </div>
    </details>
  );
}
