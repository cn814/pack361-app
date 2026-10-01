import TakeAttendance from "@/components/TakeAttendance";
import { isLeader } from "@/lib/data";
import { getEventAttendance } from "@/lib/attendance-data";
import { todayEastern } from "@/lib/meetings";
import { easternDate } from "@/lib/tz";
import type { Adult, PackEvent } from "@/lib/types";

/** Leaders, from the event's start day (Eastern) on: who was there. */
export default async function EventAttendance({ e, me }: { e: PackEvent; me: Adult }) {
  if (!isLeader(me) || easternDate(e.starts_at) > todayEastern()) return null;
  const a = await getEventAttendance(e);
  const note =
    !a.taken && a.fromRsvps > 0
      ? `Checked from ${a.fromRsvps === 1 ? "1 family" : `${a.fromRsvps} families`} that said yes. Tap to change.`
      : null;
  return <TakeAttendance eventId={e.id} groups={a.groups} present={a.present} taken={a.taken} note={note} hasFocus={a.hasFocus} />;
}
