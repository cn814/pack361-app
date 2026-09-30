import type { Metadata } from "next";
import Link from "next/link";
import { CarFront, ChevronRight, Footprints, PartyPopper, Rocket, Sailboat, Tent } from "lucide-react";
import { eventPath, featuredKind, type FeaturedKind } from "@/lib/featured";
import { headers } from "next/headers";
import EventRow from "@/components/EventRow";
import CalendarSubscribe from "@/components/CalendarSubscribe";
import { getCalendarToken } from "@/lib/data";
import { getUpcomingEvents, requireMember } from "@/lib/data";
import { getSignupSummaries } from "@/lib/signups";
import { daysUntil, fmtMonth, fmtRange } from "@/lib/format";

const ICON: Record<FeaturedKind, typeof Tent> = {
  campout: Tent,
  derby: CarFront,
  space_derby: Rocket,
  regatta: Sailboat,
  blue_gold: PartyPopper,
  crossover: Footprints,
};

export const metadata: Metadata = { title: "Events" };

export default async function EventsPage() {
  const me = await requireMember();
  const [signups, token, h] = await Promise.all([getSignupSummaries(me.family_id), getCalendarToken(), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const events = await getUpcomingEvents(100);
  const big = events
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
      <p className="-mt-2 text-sm text-muted">Pack meetings are the 1st and 3rd Mondays, 6:30 PM, First Presbyterian Church of Howard County.</p>
      {big.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-title">Big events</h2>
          {big.map(({ e, k }) => {
            const Icon = ICON[k!.kind];
            return (
              <Link key={e.id} href={eventPath(e)} className="flex items-center gap-3 rounded-2xl bg-pine-950 p-4 text-white shadow-[var(--shadow-float)]">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold text-pine-950">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-extrabold">{e.title}</span>
                  <span className="block text-xs text-mint-200">
                    {fmtRange(e.starts_at, e.ends_at)} · {daysUntil(e.starts_at).toLowerCase()}
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
    </>
  );
}
