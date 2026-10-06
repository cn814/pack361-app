import type { Metadata } from "next";
import Link from "next/link";
import { CarFront, ChevronRight, Fish, Footprints, PartyPopper, Rocket, Sailboat, Tent } from "lucide-react";
import { featuredKind, type FeaturedKind } from "@/lib/featured";
import { headers } from "next/headers";
import EventRow from "@/components/EventRow";
import CalendarSubscribe from "@/components/CalendarSubscribe";
import { getBigEvent, getCalendarToken, getUpcomingEvents, isLeader, preloadCalendar, requireMember } from "@/lib/data";
import { getSignupSummaries } from "@/lib/signups";
import { daysUntil, eventOver, fmtMonth, fmtRange } from "@/lib/format";
import { daysBetween, easternDate, startOfEasternDay } from "@/lib/tz";
import type { CalItem } from "@/lib/calendar";

const ICON: Record<FeaturedKind, typeof Tent> = {
  campout: Tent,
  derby: CarFront,
  space_derby: Rocket,
  fishing: Fish,
  regatta: Sailboat,
  blue_gold: PartyPopper,
  crossover: Footprints,
};

export const metadata: Metadata = { title: "Calendar" };

// Leaders start on their own family's dens; "All" is every den. (Families only ever see their
// own dens, so they start on "All".)
const SHOWS = [
  { key: "mine", label: "My dens", hint: "Your scouts' dens", leaderOnly: true },
  { key: "all", label: "All", hint: "Everything coming up" },
  { key: "campouts", label: "Campouts", hint: "Overnights" },
  { key: "big", label: "Big events", hint: "Derby, Blue & Gold" },
  { key: "meetings", label: "Den meetings", hint: "Week by week" },
] as const;
type Show = (typeof SHOWS)[number]["key"];

/** "This week", "Next week", then the month. */
function bucket(e: CalItem, today: string): string {
  const days = daysBetween(today, easternDate(e.starts_at));
  const dow = new Date(`${today}T12:00:00`).getDay(); // 0 = Sunday
  const toSunday = 7 - dow;
  if (days < toSunday) return "This week";
  if (days < toSunday + 7) return "Next week";
  return fmtMonth(e.starts_at);
}

export default async function EventsPage({ searchParams }: PageProps<"/events">) {
  const me = await requireMember();
  const sp = await searchParams;
  const leader = isLeader(me);
  // Older links used ?view=mine for a leader's own family's dens.
  const start: Show = leader ? "mine" : "all";
  const wanted = (sp.show ?? (sp.view === "mine" ? "mine" : start)) as Show;
  const show: Show = SHOWS.some((s) => s.key === wanted && (!("leaderOnly" in s) || leader)) ? wanted : start;
  // The list reads the full calendar; the pinned big event (and the bell) reuse it when it's
  // the same family calendar instead of reading their own.
  preloadCalendar(show === "mine" || !leader ? "family" : "all");
  const [all, signups, token, h, big] = await Promise.all([
    getUpcomingEvents(150, { mine: show === "mine" }),
    getSignupSummaries(me.family_id),
    getCalendarToken(),
    headers(),
    getBigEvent(),
  ]);
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const events = all.filter((e) =>
    eventOver(e)
      ? false
      : show === "campouts"
      ? e.kind === "event" && featuredKind(e)?.kind === "campout"
      : show === "big"
        ? e.kind === "event" && featuredKind(e) !== null
        : show === "meetings"
          ? e.kind === "meeting" || /den meeting/i.test(e.title)
          : true,
  );
  const today = easternDate(startOfEasternDay());
  const groups = new Map<string, CalItem[]>();
  for (const e of events) {
    const g = bucket(e, today);
    groups.set(g, [...(groups.get(g) ?? []), e]);
  }
  const pinned = (show === "all" || show === "mine") && big && !eventOver(big.event) ? big : null;
  const BigIcon = pinned ? ICON[pinned.kind] : Tent;

  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Calendar</h1>
      <p className="-mt-2 text-sm text-muted">
        {leader && show !== "mine" ? "Every den and pack event." : "Pack events and your scouts' dens."} Den meetings are most Mondays,
        6:30–7:30 PM, and pack meetings 6:30–8:00 PM, at First Presbyterian Church of Howard County unless noted.
      </p>

      {/* Big tiles, three to a row, instead of small chips to slide through. */}
      <nav className="grid grid-cols-3 gap-2 lg:grid-cols-5" aria-label="Show">
        {SHOWS.filter((s) => !("leaderOnly" in s) || leader).map((s) => (
          <Link
            key={s.key}
            href={s.key === start ? "/events" : `/events?show=${s.key}`}
            aria-current={show === s.key ? "page" : undefined}
            className={`flex min-h-14 flex-col justify-center rounded-2xl px-3 py-2 transition active:scale-[0.98] ${
              show === s.key ? "bg-brand text-white shadow-[var(--shadow-card)]" : "border border-line bg-card text-ink"
            }`}
          >
            <span className="text-sm font-extrabold leading-tight">{s.label}</span>
            <span className={`text-[11px] leading-tight ${show === s.key ? "text-mint-200" : "text-muted"}`}>{s.hint}</span>
          </Link>
        ))}
      </nav>

      {pinned && (
        <Link href={pinned.event.href} className="flex items-center gap-3 rounded-2xl bg-deep p-4 text-white shadow-[var(--shadow-float)]">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gold text-on-gold">
            <BigIcon className="h-6 w-6" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-extrabold uppercase tracking-[0.12em] text-gold">
              Big event · {daysUntil(pinned.event.starts_at, pinned.event.ends_at).toLowerCase()}
            </span>
            <span className="block truncate text-lg font-extrabold">{pinned.event.title}</span>
            <span className="block truncate text-xs text-mint-200">{fmtRange(pinned.event.starts_at, pinned.event.ends_at, pinned.event.all_day)}</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-mint-200" aria-hidden />
        </Link>
      )}

      {events.length === 0 && (
        <p className="card text-sm text-muted">{show === "all" || show === "mine" ? "No upcoming events yet." : "Nothing like that coming up."}</p>
      )}
      {[...groups.entries()].map(([label, list]) => (
        <section key={label} className="space-y-2">
          <h2 className="px-0.5 text-xs font-extrabold uppercase tracking-[0.1em] text-muted">{label}</h2>
          {list.map((e) => (
            <EventRow key={e.id} e={e} signup={signups.get(e.id)} />
          ))}
        </section>
      ))}

      {token && host && <CalendarSubscribe feedUrl={`${proto}://${host}/api/calendar/${token}.ics`} open={sp.subscribe === "1"} />}
      <Link href="/events/archive" className="card flex items-center justify-between text-sm font-bold text-pine">
        Past events
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    </>
  );
}
