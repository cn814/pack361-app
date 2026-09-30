import { Archive, ArchiveRestore } from "lucide-react";
import SubmitButton from "@/components/SubmitButton";
import { setEventArchived } from "@/app/(app)/events/actions";
import type { PackEvent } from "@/lib/types";

/** The "in the archive" note on an event, and the leaders' button to hide it or put it back. */
export default function ArchiveControl({
  e,
  leader,
  back,
  part = "both",
}: {
  e: PackEvent;
  leader: boolean;
  back: string;
  part?: "note" | "button" | "both";
}) {
  const archived = Boolean(e.archived_at);
  return (
    <>
      {archived && part !== "button" && (
        <p className="flex items-start gap-1.5 rounded-2xl border border-line bg-surface p-3 text-sm text-muted">
          <Archive className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {e.archived_reason === "removed_in_twh"
            ? "This event was removed from the TroopWebHost calendar, so it's in the archive."
            : "A leader took this event off the calendar. It's kept in the archive."}
        </p>
      )}
      {leader && part !== "note" && (
        <form action={setEventArchived}>
          <input type="hidden" name="id" value={e.id} />
          <input type="hidden" name="archive" value={archived ? "0" : "1"} />
          <input type="hidden" name="back" value={back} />
          <SubmitButton className="btn-ghost w-full py-2 text-sm">
            {archived ? <ArchiveRestore className="h-4 w-4" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
            {archived ? "Put back on the calendar" : "Take off the calendar (moves to the archive)"}
          </SubmitButton>
        </form>
      )}
    </>
  );
}
