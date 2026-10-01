import type { Metadata } from "next";
import Link from "next/link";
import { CarFront, ChevronRight, Fish, Footprints, Landmark, PartyPopper, Plus, Rocket, Sailboat, Tent } from "lucide-react";
import { featuredKind, type FeaturedKind } from "@/lib/featured";
import { headers } from "next/headers";
import EventRow from "@/components/EventRow";
import CalendarSubscribe from "@/components/CalendarSubscribe";
import { getCalendarToken } from "@/lib/data";
import { getUpcomingEvents, isCommittee, isLeader, requireMember } from "@/lib/data";
import { getSignupSummaries } from "@/lib/signups";
import { daysUntil, fmtMonth, fmtRange } from "@/lib/format";

const ICON: Record<FeaturedKind, typeof Tent> = {
  campout: Tent,
  derby: CarFront,
  space_derby: Rocket,
  fishing: Fish,
  regatta: Sailboat,
  blue_gold: PartyPopper,
  crossover: Footprints,
};

export const metadata: Metadata = { title: "Events" };

export default async function EventsPage({ searchParams }: PageProps<"/events">) {
  const me = await requireMember();
  const { view } = await searchParams;
  const leader = isLeader(me);
  const mine = leader && view === "mine";
  const [signups, token, h] = await Promise.all([getSignupSummaries(me.family_id), getCalendarToken(), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const events = await getUpcomingEvents(150, { mine });
  const big = events
    .filter((e) => e.kind === "event")
    .map((e) => ({ e, k: featuredKind(e) }))
    .filter((x) => x.k)
    .slice(0, 4);
  const byMonth = new Map<string, typeof events>();
  for (const e of events) {
    const m = fmtMonth(e.starts_at);
    byMonth.set(m, [...(byMonth.get(m) ?? []), e]);
  }
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Pack calendar</h1>
      <p className="-mt-2 text-sm text-muted">Den meetings are most Mondays, 6:30–7:30 PM, and pack meetings 6:30–8:00 PM, at First Presbyterian Church of Howard County unless noted.</p>
      {leader && (
        <div className="flex gap-2 text-sm font-semibold" role="tablist" aria-label="Which events">
          <Link href="/events" role="tab" aria-selected={!mine} className={`rounded-full px-3 py-1.5 ${!mine ? "bg-pine text-white" : "border border-line bg-white text-navy"}`}>
            Every den
          </Link>
          <Link href="/events?view=mine" role="tab" aria-selected={mine} className={`rounded-full px-3 py-1.5 ${mine ? "bg-pine text-white" : "border border-line bg-white text-navy"}`}>
            My family&apos;s dens
          </Link>
        </div>
      )}
      {!leader && <p className="-mt-2 text-xs text-muted">Showing pack events and your scouts&apos; dens.</p>}
      {leader && (
        <div className="flex gap-2">
          <Link href="/events/new" className="btn-primary flex-1 py-2">
            <Plus className="h-4 w-4" aria-hidden /> Add an event
          </Link>
          {isCommittee(me) && (
            <Link href="/events/council" className="btn-ghost flex-1 py-2">
              <Landmark className="h-4 w-4" aria-hidden /> Council events
            </Link>
          )}
        </div>
      )}
      {big.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-title">Big events</h2>
          {big.map(({ e, k }) => {
            const Icon = ICON[k!.kind];
            return (
              <Link key={e.id} href={e.href} className="flex items-center gap-3 rounded-2xl bg-pine-950 p-4 text-white shadow-[var(--shadow-float)]">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold text-pine-950">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-extrabold">{e.title}</span>
                  <span className="block text-xs text-mint-200">
                    {fmtRange(e.starts_at, e.ends_at, e.all_day)} · {daysUntil(e.starts_at, e.ends_at).toLowerCase()}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-mint-200" aria-hidden />
              </Link>
            );
          })}
        </section>
      )}
      {token && host && <CalendarSubscribe feedUrl={`${proto}://${host}/api/calendar/${token}.ics`} />}
      {events.length === 0 && <p className="card text-sm text-muted">No upcoming events yet.</p>}
      {[...byMonth.entries()].map(([month, list]) => (
        <section key={month} className="space-y-3">
          <h2 className="section-title">{month}</h2>
          {list.map((e) => (
            <EventRow key={e.id} e={e} signup={signups.get(e.id)} />
          ))}
        </section>
      ))}
      <Link href="/events/archive" className="card flex items-center justify-between text-sm font-bold text-pine">
        Past events and archive
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    </>
  );
}
