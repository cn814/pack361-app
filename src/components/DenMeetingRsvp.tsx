"use client";

import { useState, useTransition } from "react";
import { CalendarCheck } from "lucide-react";
import { setDenMeetingRsvp } from "@/app/(app)/meetings/actions";
import { failedCallMessage } from "@/components/ActionForm";

interface Props {
  meetingId: string;
  scouts: { id: string; first_name: string; going: boolean | null }[];
  /** Hide the heading (when shown inside another card). */
  compact?: boolean;
}

/** Going / can't go, per scout, for a den meeting. Only the family's own scouts in that den. */
export default function DenMeetingRsvp({ meetingId, scouts, compact }: Props) {
  const [answers, setAnswers] = useState<Record<string, boolean | null>>(Object.fromEntries(scouts.map((s) => [s.id, s.going])));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!scouts.length) return null;

  const answer = (scoutId: string, going: boolean) => {
    const before = answers[scoutId];
    setAnswers((a) => ({ ...a, [scoutId]: going }));
    setError(null);
    start(async () => {
      let problem: string | null = null;
      try {
        problem = (await setDenMeetingRsvp(meetingId, scoutId, going)).error ?? null;
      } catch (e) {
        problem = failedCallMessage(e, "your answer");
      }
      if (problem) {
        // Show the answer that's actually saved, not the one that didn't go through.
        setAnswers((a) => ({ ...a, [scoutId]: before }));
        setError(problem);
      }
    });
  };

  const body = (
    <div className="space-y-2">
      {scouts.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-ink">{s.first_name}</span>
          <span className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={`Is ${s.first_name} coming?`}>
            {([true, false] as const).map((g) => {
              const on = answers[s.id] === g;
              return (
                <button
                  key={String(g)}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={pending}
                  onClick={() => answer(s.id, g)}
                  className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-bold ${on ? "border-pine bg-brand text-white" : "border-line bg-card text-navy"}`}
                >
                  {g ? "Going" : "Can't go"}
                </button>
              );
            })}
          </span>
        </div>
      ))}
      {error && <p className="text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
  if (compact) return body;
  return (
    <section id="rsvp" className="card scroll-mt-20 space-y-3 border-l-4 border-l-gold">
      <h2 className="section-title flex items-center gap-1.5">
        <CalendarCheck className="h-4 w-4" aria-hidden /> RSVP
      </h2>
      <p className="text-sm text-muted">Let the den leader know who&apos;s coming.</p>
      {body}
    </section>
  );
}
