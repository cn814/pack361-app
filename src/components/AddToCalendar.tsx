import { CalendarPlus } from "lucide-react";

/**
 * "Add to my calendar" for one event or campout: opens /events/<id>/ics, which phones show with
 * an Add button and computers download. A plain link (not next/link): it's a file, not a page.
 */
export default function AddToCalendar({ eventId, className = "btn-ghost w-full" }: { eventId: string; className?: string }) {
  return (
    <a href={`/events/${eventId}/ics`} className={`min-h-10 ${className}`}>
      <CalendarPlus className="h-4 w-4" aria-hidden /> Add to my calendar
    </a>
  );
}
