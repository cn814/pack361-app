import Link from "next/link";
import { CalendarCheck, CircleCheck, CircleHelp, CircleX, Hourglass, type LucideIcon } from "lucide-react";
import type { PackEvent } from "@/lib/types";
import { eventOver } from "@/lib/format";
import { eventPath } from "@/lib/featured";
import { getMyAnswers, type MyAnswer } from "@/lib/rsvp";

type Variant = "button" | "link" | "dark";

/** How each answer shows on the button: the family's response, in its color, still a tap to change it. */
function look(a: MyAnswer | undefined): { label: string; icon: LucideIcon; tone: Record<Variant, string> } | null {
  if (!a) return null;
  if (a.status === "yes" && a.waitlisted)
    return { label: "Waitlisted", icon: Hourglass, tone: { button: "border-transparent bg-gold-50 text-gold-800", link: "text-gold-800", dark: "text-gold" } };
  if (a.status === "yes")
    return { label: "Going", icon: CircleCheck, tone: { button: "border-transparent bg-mint text-pine", link: "text-pine", dark: "text-mint-200" } };
  if (a.status === "maybe")
    return { label: "Maybe", icon: CircleHelp, tone: { button: "border-transparent bg-gold-50 text-gold-800", link: "text-gold-800", dark: "text-gold" } };
  return { label: "Can't go", icon: CircleX, tone: { button: "border-transparent bg-surface-low text-muted", link: "text-muted", dark: "text-white/70" } };
}

/**
 * The RSVP button for events that take RSVPs in the app (on for every event unless a leader turns it off).
 * Once the family has answered it shows their answer (Going, Maybe, Can't go, Waitlisted) instead
 * of "RSVP"; tapping it still opens the RSVP form to change it. Hidden once the event is over or
 * archived. RSVPs never go to TroopWebHost. Den meetings planned in the app keep their own
 * per-scout answers on the meeting page.
 */
export default async function RsvpLink({
  e,
  variant = "button",
}: {
  e: PackEvent & { href?: string; kind?: string };
  variant?: Variant;
}) {
  if (!e.rsvp_enabled || e.archived_at || eventOver(e)) return null;
  const meeting = e.kind === "meeting";
  const answer = meeting ? null : look((await getMyAnswers()).get(e.id));
  const base =
    variant === "link"
      ? "inline-flex items-center gap-1 text-xs font-bold underline"
      : variant === "dark"
        ? "inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold"
        : "btn-ghost py-2";
  const Icon = answer?.icon ?? CalendarCheck;
  const text = answer ? (variant === "link" ? `RSVP: ${answer.label}` : answer.label) : "RSVP";
  return (
    <Link
      href={`${meeting && e.href ? e.href : eventPath(e)}#rsvp`}
      className={`${base} ${answer ? answer.tone[variant] : variant === "link" ? "text-pine" : ""}`}
      aria-label={answer ? `Your RSVP: ${answer.label}. Change it` : undefined}
    >
      <Icon className={variant === "link" ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden /> {text}
    </Link>
  );
}
