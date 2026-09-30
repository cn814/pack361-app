import { CalendarCheck } from "lucide-react";
import type { PackEvent } from "@/lib/types";

const TWH_HOME = process.env.NEXT_PUBLIC_TWH_URL ?? "https://www.troopwebhostcs.org/Pack361EllicottCity/";

/** RSVP on TroopWebHost, for events that come from the pack's TroopWebHost calendar. */
export default function RsvpLink({ e, variant = "button" }: { e: PackEvent; variant?: "button" | "link" | "dark" }) {
  if (!e.twh_uid) return null;
  const href = e.twh_url || TWH_HOME;
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
