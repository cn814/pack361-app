import Link from "next/link";
import { Hammer } from "lucide-react";
import CopyEventForm from "@/components/CopyEventForm";
import { isCommittee, isLeader } from "@/lib/data";
import { hasFee } from "@/lib/money";
import type { Adult, PackEvent } from "@/lib/types";

/** Leaders: open the builder for the event's schedule, packing list, info sections and links. */
export function BuildEventLink({ e, me }: { e: PackEvent; me: Adult }) {
  if (!isLeader(me)) return null;
  return (
    <Link href={`/events/${e.id}/build`} className="btn-ghost w-full py-2 text-sm">
      <Hammer className="h-4 w-4" aria-hidden />
      {e.category === "Campout" ? "Build schedule, packing list and info" : "Add schedule, info and links"}
    </Link>
  );
}

/** Leaders: copy the event to a new date (opens the copy's edit page). */
export function CopyEventButton({ e, me }: { e: PackEvent; me: Adult }) {
  if (!isLeader(me)) return null;
  // The database checks the real role, not the "View as" one.
  const setsCost = isCommittee({ ...me, role: me.real_role ?? me.role });
  return <CopyEventForm eventId={e.id} costDropped={hasFee(e) && !setsCost} />;
}
