import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import type { PackEvent } from "@/lib/types";
import { isPast } from "@/lib/format";
import { eventPath } from "@/lib/featured";

/**
 * The RSVP button for events that take RSVPs in the app (a leader turns on "Take RSVPs").
 * Hidden once the event is over or archived. RSVPs never go to TroopWebHost.
 */
export default function RsvpLink({ e, variant = "button" }: { e: PackEvent & { href?: string; kind?: string }; variant?: "button" | "link" | "dark" }) {
  if (!e.rsvp_enabled || e.archived_at || isPast(e.ends_at ?? e.starts_at)) return null;
  const cls =
    variant === "link"
      ? "inline-flex items-center gap-1 text-xs font-bold text-pine underline"
      : variant === "dark"
        ? "inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold"
        : "btn-ghost py-2";
  return (
    <Link href={`${e.kind === "meeting" && e.href ? e.href : eventPath(e)}#rsvp`} className={cls}>
      <CalendarCheck className={variant === "link" ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden /> RSVP
    </Link>
  );
}
