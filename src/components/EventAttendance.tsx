import { ClipboardCheck } from "lucide-react";
import TakeAttendance from "@/components/TakeAttendance";
import { isLeader } from "@/lib/data";
import { getEventAttendance } from "@/lib/attendance-data";
import { todayEastern } from "@/lib/meetings";
import { easternDate } from "@/lib/tz";
import { fmtDay } from "@/lib/format";
import type { Adult, PackEvent } from "@/lib/types";

/** Leaders, from the event's start day (Eastern) on: who was there. Before that, when it opens. */
export default async function EventAttendance({ e, me }: { e: PackEvent; me: Adult }) {
  if (!isLeader(me)) return null;
  if (easternDate(e.starts_at) > todayEastern()) {
    return (
      <section className="card space-y-2 border-l-4 border-l-pine">
        <h2 className="section-title flex items-center gap-1.5">
          <ClipboardCheck className="h-4 w-4" aria-hidden /> Take attendance
        </h2>
        <p className="text-sm text-ink">
          Attendance opens on <b>{fmtDay(e.starts_at)}</b>, the day {e.ends_at && easternDate(e.ends_at) !== easternDate(e.starts_at) ? "it starts" : "of the event"}. Come back here then: everyone
          whose family said Going will already be checked, so you just fix who&apos;s missing and Save.
        </p>
        {e.rsvp_enabled && <p className="text-xs text-muted">Until then, Who&apos;s going in this box shows who said yes.</p>}
      </section>
    );
  }
  const a = await getEventAttendance(e, me);
  const note =
    [
      a.ownDens ? `Your den${a.ownDens.length === 1 ? "" : "s"} only (${a.ownDens.join(", ") || "no scouts yet"}). Other dens' leaders check their own.` : null,
      !a.taken && a.fromRsvps > 0 ? `Checked from ${a.fromRsvps === 1 ? "1 family" : `${a.fromRsvps} families`} that said yes. Tap to change.` : null,
    ]
      .filter(Boolean)
      .join(" ") || null;
  return <TakeAttendance eventId={e.id} groups={a.groups} present={a.present} taken={a.taken} note={note} hasFocus={a.hasFocus} />;
}
