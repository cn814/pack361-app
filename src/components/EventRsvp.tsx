import Link from "next/link";
import { Pencil } from "lucide-react";
import RsvpCard from "@/components/RsvpCard";
import { getMyScouts, isLeader } from "@/lib/data";
import { getRsvp, rsvpOpen } from "@/lib/rsvp";
import { fmtShortDate } from "@/lib/advancement";
import type { Adult, PackEvent } from "@/lib/types";

/** The RSVP card for an event that takes RSVPs in the app. */
export async function EventRsvp({ e, me }: { e: PackEvent; me: Adult }) {
  if (!e.rsvp_enabled) return null;
  const leader = isLeader(me);
  const [data, scouts] = await Promise.all([getRsvp(e.id, me, leader), getMyScouts()]);
  // Suggest the scouts the event is for: that den's, or everyone's.
  const mineForEvent = e.den_id ? scouts.filter((s) => s.den?.id === e.den_id) : scouts;
  return (
    <RsvpCard
      eventId={e.id}
      open={rsvpOpen(e)}
      deadline={e.rsvp_by ? fmtShortDate(e.rsvp_by) : null}
      mine={data.mine}
      counts={data.counts}
      defaultScouts={mineForEvent.length || scouts.length}
      hasFamily={Boolean(me.family_id)}
      rows={leader ? data.rows : undefined}
    />
  );
}

/** Leaders: edit this event. */
export function EditEventLink({ e, me }: { e: PackEvent; me: Adult }) {
  if (!isLeader(me)) return null;
  return (
    <Link href={`/events/${e.id}/edit`} className="btn-ghost w-full py-2 text-sm">
      <Pencil className="h-4 w-4" aria-hidden /> Edit event
    </Link>
  );
}
