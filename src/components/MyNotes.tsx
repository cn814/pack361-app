import Link from "next/link";
import { Lock, NotebookPen } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import { saveMyNote } from "@/app/(app)/my-notes-actions";
import { getMyNote } from "@/lib/my-notes";
import { timeAgo } from "@/lib/format";

/**
 * My own notes: the general notepad (no eventId) or my notes for one meeting. Saved to my account,
 * so they're there on any phone or computer I sign in on. Nobody else can read them.
 */
export default async function MyNotes({ eventId, title = "My notes" }: { eventId?: string; title?: string }) {
  const note = await getMyNote(eventId);
  return (
    <section id="my-notes" className="card scroll-mt-20 space-y-2">
      <h2 className="section-title flex items-center gap-1.5">
        <NotebookPen className="h-4 w-4" aria-hidden /> {title}
      </h2>
      <p className="flex items-start gap-1.5 text-xs text-muted">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Only you can see these, not leaders or admins.
          {note.updated_at ? ` Last saved ${timeAgo(note.updated_at)}.` : ""}
          {eventId && (
            <>
              {" "}
              All your notes are under{" "}
              <Link href="/family/notes" className="font-bold text-pine underline">
                Me → My notepad
              </Link>
              .
            </>
          )}
        </span>
      </p>
      <ActionForm action={saveMyNote} submit="Save my notes" resetOnSuccess={false} buttonClass="btn-primary w-full py-2.5">
        {eventId && <input type="hidden" name="event_id" value={eventId} />}
        <textarea
          name="body"
          defaultValue={note.body}
          rows={eventId ? 8 : 12}
          maxLength={50000}
          className="input min-h-40 w-full"
          placeholder={eventId ? "What came up, decisions, what you said you'd do…" : "Anything you want to keep: ideas, to-dos, reminders…"}
          aria-label={title}
        />
      </ActionForm>
    </section>
  );
}
