import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import type { PackEvent } from "@/lib/types";
import { rsvpHref } from "@/lib/twh-link";
import { isPast } from "@/lib/format";
import { eventPath } from "@/lib/featured";

// While the pack still uses TroopWebHost (TWH_CALENDAR_URL set), synced events can RSVP there.
const twhActive = () => Boolean(process.env.TWH_CALENDAR_URL?.trim());

/**
 * The RSVP button: the app's own RSVP when the event takes RSVPs here, otherwise (while the
 * pack uses TroopWebHost) the event's TroopWebHost page. Hidden once the event is over.
 */
export default function RsvpLink({ e, variant = "button" }: { e: PackEvent; variant?: "button" | "link" | "dark" }) {
  if (e.archived_at || isPast(e.ends_at ?? e.starts_at)) return null;
  const inApp = Boolean(e.rsvp_enabled);
  if (!inApp && !(e.twh_uid && twhActive())) return null;
  const label = inApp ? "RSVP" : "RSVP on TroopWebHost";
  const cls =
    variant === "link"
      ? "inline-flex items-center gap-1 text-xs font-bold text-pine underline"
      : variant === "dark"
        ? "inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold"
        : "btn-ghost py-2";
  const icon = <CalendarCheck className={variant === "link" ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden />;
  if (inApp) {
    return (
      <Link href={`${eventPath(e)}#rsvp`} className={cls}>
        {icon} {variant === "link" ? label : "RSVP"}
      </Link>
    );
  }
  return (
    <a href={rsvpHref(e)} target="_blank" rel="noopener noreferrer" className={cls}>
      {icon} {variant === "link" ? label : "RSVP"}
    </a>
  );
}
