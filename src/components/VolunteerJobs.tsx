import { HandHelping, Plus, Trash2, X } from "lucide-react";
import ActionForm, { Field } from "@/components/ActionForm";
import SubmitButton from "@/components/SubmitButton";
import { addVolunteerSlot, deleteVolunteerSlot, volunteerCancel, volunteerSignUp } from "@/app/(app)/volunteer-actions";
import type { VolunteerSlot } from "@/lib/volunteer";

/** Volunteer jobs for one event: families sign up; leaders add jobs and manage the list. */
export default function VolunteerJobs({
  eventId,
  slots,
  meId,
  leader,
}: {
  eventId: string;
  slots: VolunteerSlot[];
  meId: string;
  leader: boolean;
}) {
  if (!slots.length && !leader) return null;
  const open = slots.reduce((n, s) => n + Math.max(0, s.capacity - s.people.length), 0);
  return (
    <section id="volunteer" className="card scroll-mt-20 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="section-title flex items-center gap-1.5">
          <HandHelping className="h-4 w-4" aria-hidden /> Volunteer jobs
        </h2>
        {slots.length > 0 && <span className="text-xs text-muted">{open ? `${open} spot${open === 1 ? "" : "s"} open` : "All filled, thank you!"}</span>}
      </div>
      {slots.length === 0 && <p className="text-sm text-muted">No jobs posted yet. Add one below.</p>}
      <ul className="space-y-2">
        {slots.map((s) => {
          const mine = s.people.some((p) => p.adult_id === meId);
          const full = s.people.length >= s.capacity;
          return (
            <li key={s.id} className={`rounded-xl border p-3 ${s.is_urgent && !full ? "border-gold bg-gold-50" : "border-line"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    {s.role_title}
                    {s.is_urgent && !full && <span className="badge ml-2 bg-gold text-pine-950">Needed</span>}
                  </p>
                  {(s.shift_label || s.notes) && (
                    <p className="text-xs text-muted">{[s.shift_label, s.notes].filter(Boolean).join(" · ")}</p>
                  )}
                  <p className="mt-1 text-xs text-navy">
                    {s.people.length}/{s.capacity}
                    {s.people.length > 0 && ": "}
                    {s.people.map((p, i) => (
                      <span key={p.adult_id}>
                        {i > 0 && ", "}
                        {p.adult_id === meId ? <b>you</b> : p.name}
                        {leader && p.adult_id !== meId && (
                          <form action={volunteerCancel} className="inline">
                            <input type="hidden" name="slot_id" value={s.id} />
                            <input type="hidden" name="event_id" value={eventId} />
                            <input type="hidden" name="adult_id" value={p.adult_id} />
                            <SubmitButton className="ml-0.5 inline-flex align-middle text-muted" aria-label={`Remove ${p.name}`}>
                              <X className="h-3 w-3" aria-hidden />
                            </SubmitButton>
                          </form>
                        )}
                      </span>
                    ))}
                  </p>
                </div>
                {leader && (
                  <form action={deleteVolunteerSlot}>
                    <input type="hidden" name="slot_id" value={s.id} />
                    <input type="hidden" name="event_id" value={eventId} />
                    <SubmitButton className="flex h-8 w-8 items-center justify-center rounded-full text-muted" aria-label={`Delete job ${s.role_title}`}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </SubmitButton>
                  </form>
                )}
              </div>
              <div className="mt-2">
                {mine ? (
                  <form action={volunteerCancel}>
                    <input type="hidden" name="slot_id" value={s.id} />
                    <input type="hidden" name="event_id" value={eventId} />
                    <SubmitButton className="btn-ghost w-full py-2">I can&apos;t make it</SubmitButton>
                  </form>
                ) : (
                  !full && (
                    <ActionForm action={volunteerSignUp} submit="I'll do it" busy="Signing up…" className="space-y-2" buttonClass="btn-primary w-full py-2">
                      <input type="hidden" name="slot_id" value={s.id} />
                      <input type="hidden" name="event_id" value={eventId} />
                    </ActionForm>
                  )
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {leader && (
        <details>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-pine">
            <Plus className="h-4 w-4" aria-hidden /> Add a job
          </summary>
          <div className="pt-3">
            <ActionForm action={addVolunteerSlot} submit="Add job" busy="Adding…">
              <input type="hidden" name="event_id" value={eventId} />
              <Field label="Job">
                <input className="input" name="role_title" required placeholder="Saturday breakfast cook" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="When (optional)">
                  <input className="input" name="shift_label" placeholder="Sat 7–8 AM" />
                </Field>
                <Field label="People needed">
                  <input className="input" type="number" name="capacity" min={1} max={50} defaultValue={1} />
                </Field>
              </div>
              <Field label="Details (optional)">
                <input className="input" name="notes" placeholder="Pack stove provided" />
              </Field>
              <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                <input type="checkbox" name="is_urgent" className="h-4 w-4 accent-pine" /> Highlight as urgently needed
              </label>
            </ActionForm>
          </div>
        </details>
      )}
    </section>
  );
}
