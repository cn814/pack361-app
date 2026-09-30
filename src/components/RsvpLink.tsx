import { CalendarCheck } from "lucide-react";
import type { PackEvent } from "@/lib/types";
import { rsvpHref } from "@/lib/twh-link";
import { isPast } from "@/lib/format";

/** RSVP on TroopWebHost, for events that come from the pack's TroopWebHost calendar. */
export default function RsvpLink({ e, variant = "button" }: { e: PackEvent; variant?: "button" | "link" | "dark" }) {
  // Nothing to RSVP to once the event is over or off the calendar.
  if (!e.twh_uid || e.archived_at || isPast(e.ends_at ?? e.starts_at)) return null;
  const href = rsvpHref(e);
  if (variant === "link") {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-pine underline">
        <CalendarCheck className="h-3.5 w-3.5" aria-hidden /> RSVP on TroopWebHost
      </a>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={variant === "dark" ? "inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold" : "btn-ghost py-2"}
    >
      <CalendarCheck className="h-4 w-4" aria-hidden /> RSVP
    </a>
  );
}
