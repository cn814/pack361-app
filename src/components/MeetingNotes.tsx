import { NotebookPen } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import { saveMeetingNotes } from "@/app/(app)/meeting-notes-actions";
import { getMeetingNotes, type NotesTarget } from "@/lib/meeting-notes";
import { timeAgo } from "@/lib/format";

/**
 * Leader notes for a meeting: one shared box for the leaders running it (what came up, what to
 * follow up on). Families never see it. Render only for leaders.
 */
export default async function MeetingNotes({ target, title = "Leader notes" }: { target: NotesTarget; title?: string }) {
  const notes = await getMeetingNotes(target);
  return (
    <section id="notes" className="card scroll-mt-20 space-y-2">
      <h2 className="section-title flex items-center gap-1.5">
        <NotebookPen className="h-4 w-4" aria-hidden /> {title}
      </h2>
      <p className="text-xs text-muted">
        For the leaders: what came up, what to follow up on, who&rsquo;s bringing what. Families don&rsquo;t see these.
        {notes.updated_at && (
          <>
            {" "}
            Last saved {timeAgo(notes.updated_at)}
            {notes.by ? ` by ${notes.by}` : ""}.
          </>
        )}
      </p>
      <ActionForm action={saveMeetingNotes} submit="Save notes" resetOnSuccess={false} buttonClass="btn-primary w-full py-2.5">
        {"eventId" in target ? (
          <input type="hidden" name="event_id" value={target.eventId} />
        ) : (
          <>
            <input type="hidden" name="den_id" value={target.denId} />
            <input type="hidden" name="day" value={target.day} />
          </>
        )}
        <textarea
          name="body"
          defaultValue={notes.body}
          rows={6}
          maxLength={20000}
          className="input min-h-32 w-full"
          placeholder="Notes for this meeting…"
          aria-label={title}
        />
      </ActionForm>
    </section>
  );
}
