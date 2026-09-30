import type { Metadata } from "next";
import { headers } from "next/headers";
import EventRow from "@/components/EventRow";
import CalendarSubscribe from "@/components/CalendarSubscribe";
import { getCalendarToken } from "@/lib/data";
import { getUpcomingEvents, requireMember } from "@/lib/data";
import { getSignupSummaries } from "@/lib/signups";
import { fmtMonth } from "@/lib/format";

export const metadata: Metadata = { title: "Events" };

export default async function EventsPage() {
  const me = await requireMember();
  const [signups, token, h] = await Promise.all([getSignupSummaries(me.family_id), getCalendarToken(), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const events = await getUpcomingEvents(100);
  const byMonth = new Map<string, typeof events>();
  for (const e of events) {
    const m = fmtMonth(e.starts_at);
    byMonth.set(m, [...(byMonth.get(m) ?? []), e]);
  }
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Pack calendar</h1>
      <p className="-mt-2 text-sm text-muted">Pack meetings are the 1st and 3rd Mondays, 6:30 PM, First Presbyterian Church of Howard County.</p>
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
