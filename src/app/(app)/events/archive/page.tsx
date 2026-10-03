import type { Metadata } from "next";
import BackLink from "@/components/BackLink";
import EventRow from "@/components/EventRow";
import { isLeader, requireMember } from "@/lib/data";
import { denScopeFor, loadArchive } from "@/lib/calendar";
import { createClient } from "@/lib/supabase/server";
import { easternDate } from "@/lib/tz";

export const metadata: Metadata = { title: "Event archive" };

export default async function ArchivePage() {
  const me = await requireMember();
  const supabase = await createClient();
  const scope = await denScopeFor(supabase, me);
  const events = await loadArchive(supabase, scope, new Date().toISOString());
  const byYear = new Map<string, typeof events>();
  for (const e of events) {
    const y = easternDate(e.starts_at).slice(0, 4);
    byYear.set(y, [...(byYear.get(y) ?? []), e]);
  }
  return (
    <>
      <BackLink href="/events" label="Calendar" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Event archive</h1>
      <p className="-mt-2 text-sm text-muted">
        Past events, newest first, plus events taken off the calendar.{" "}
        {isLeader(me) ? "Open one to put it back." : "Photos from past events are in each event's album."}
      </p>
      {events.length === 0 && <p className="card text-sm text-muted">Nothing here yet.</p>}
      {[...byYear.entries()].map(([year, list]) => (
        <details key={year} className="space-y-3" open={year === [...byYear.keys()][0]}>
          <summary className="section-title cursor-pointer list-none">
            {year} <span className="font-normal text-muted">· {list.length} event{list.length === 1 ? "" : "s"}</span>
          </summary>
          <div className="space-y-3 pt-2">
            {list.map((e) => (
              <div key={e.id} className="space-y-1">
                <EventRow e={e} />
                {e.archived_reason && (
                  <p className="px-1 text-[11px] text-muted">
                    {e.archived_reason === "removed_in_twh" ? "Removed from TroopWebHost" : "Taken off the calendar by a leader"}
                  </p>
                )}
              </div>
            ))}
          </div>
        </details>
      ))}
    </>
  );
}
