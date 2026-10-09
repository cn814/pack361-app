import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import BackLink from "@/components/BackLink";
import MyNotes from "@/components/MyNotes";
import { requireMember } from "@/lib/data";
import { getMyMeetingNotes } from "@/lib/my-notes";
import { fmtRange } from "@/lib/format";

export const metadata: Metadata = { title: "My notepad" };

/** Me → My notepad: my own notepad, and the notes I took at meetings. Nobody else sees any of it. */
export default async function MyNotepadPage() {
  await requireMember();
  const meetings = await getMyMeetingNotes();
  return (
    <>
      <BackLink href="/family" label="Me" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">My notepad</h1>
      <MyNotes title="Notepad" />
      <section className="space-y-2">
        <h2 className="px-0.5 text-base font-extrabold text-pine-950">My meeting notes</h2>
        {meetings.length ? (
          meetings.map((m) => (
            <Link key={m.event_id} href={`/events/${m.event_id}#my-notes`} className="card flex items-center gap-3 py-3 active:bg-surface-low">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-extrabold text-pine-950">{m.title}</span>
                <span className="block text-xs text-muted">{fmtRange(m.starts_at, null, false)}</span>
                <span className="mt-1 line-clamp-2 block text-sm text-ink">{m.body}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
            </Link>
          ))
        ) : (
          <p className="text-sm text-muted">Notes you take at committee meetings and online meetings (Take notes on the meeting) show up here.</p>
        )}
      </section>
    </>
  );
}
