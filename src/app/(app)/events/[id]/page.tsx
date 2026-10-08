import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Backpack, CalendarDays, Car, ClipboardCheck, Clock, CloudSun, HandHelping, Info, Leaf, MapPin, Ticket, Video } from "lucide-react";
import { eventLinkLabel, isVideoCall } from "@/lib/event-link";
import BackLink from "@/components/BackLink";
import NavigateLink from "@/components/NavigateLink";
import { navDestination } from "@/lib/navigate";
import VolunteerJobs from "@/components/VolunteerJobs";
import RsvpLink from "@/components/RsvpLink";
import EventTabs from "@/components/EventTabs";
import EventSchedule from "@/components/EventSchedule";
import ClampText from "@/components/ClampText";
import PackingChecklist from "@/components/PackingChecklist";
import EventPhotosLink from "@/components/EventPhotosLink";
import ArchiveControl from "@/components/ArchiveControl";
import PermissionSlips from "@/components/PermissionSlips";
import EventSignal from "@/components/EventSignal";
import EventCarpool from "@/components/EventCarpool";
import { eventLeaderTabs } from "@/components/EventLeaderTabs";
import EventWeather from "@/components/EventWeather";
import EventTrailGuide from "@/components/EventTrailGuide";
import AddToCalendar from "@/components/AddToCalendar";
import { EventRsvp } from "@/components/EventRsvp";
import { EventLinks, EventSections } from "@/components/EventInfo";
import { getEvent, getItinerary, isLeader, requireMember } from "@/lib/data";
import { getOwnPackingList } from "@/lib/event-builder-data";
import { getSlots } from "@/lib/volunteer";
import { easternDate, ranksLabel } from "@/lib/calendar";
import { fmtMeetingTime, todayEastern } from "@/lib/meetings";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { fmtRange } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/events/[id]">): Promise<Metadata> {
  const { id } = await params;
  const { eventTitle } = await import("@/lib/page-titles");
  return { title: (await eventTitle(id)) ?? "Event" };
}

export default async function EventPage({ params }: PageProps<"/events/[id]">) {
  const me = await requireMember();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // Nothing here depends on the event row: read it all at once.
  const [event, slots, itinerary, packing] = await Promise.all([getEvent(id), getSlots(id), getItinerary(id), getOwnPackingList(id)]);
  if (!event) notFound();
  if (event.category === "Campout") redirect(`/campouts/${id}`);
  // On a pack-wide den-meeting night, list the dens that meet somewhere else.
  let elsewhere: { id: string; title: string; location: string | null; start_time: string | null; end_time: string | null; den: { name: string } | null }[] = [];
  if (event.category === "Den Meeting" && !event.den_id) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("den_meetings")
      .select("id, title, location, start_time, end_time, den:dens(name)")
      .eq("meets_on", easternDate(event.starts_at));
    elsewhere = (data ?? []) as unknown as typeof elsewhere;
  }
  const audience = ranksLabel(event.ranks);
  const place = [event.location_name, event.address].filter(Boolean).join(", ");
  const navTo = navDestination({ address: event.address, location_name: event.location_name });

  const leader = isLeader(me);
  // Den meetings are recorded on the den's meeting page (attendance and requirements together).
  const denMeeting = event.category === "Den Meeting";

  const overview = (
    <>
      <section className="card space-y-2 border-t-4 border-t-gold">
        <div className="flex flex-wrap gap-2">
          <span className="badge bg-gold-50 text-gold-700">{event.category}</span>
          {audience && <span className="badge bg-deep-navy text-white">For {audience}</span>}
          {event.only_scouts?.length ? (
            <span className="badge bg-gold-50 text-gold-800">{leader ? `Only for ${event.only_scouts.length} scout${event.only_scouts.length === 1 ? "" : "s"}` : "Just for some scouts"}</span>
          ) : null}
          {event.leaders_only && <span className="badge bg-surface text-navy">Leaders</span>}
          {event.source === "council" && <span className="badge bg-surface text-navy">Council event</span>}
        </div>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-pine-950">{event.title}</h1>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <CalendarDays className="h-4 w-4" aria-hidden /> {fmtRange(event.starts_at, event.ends_at, event.all_day)}
        </p>
        {place && (
          <p className="flex items-start gap-1.5 text-sm text-muted">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {place}
          </p>
        )}
        {event.details && <ClampText text={event.details} className="pt-1" />}
        <div className="flex flex-wrap gap-2 pt-2">
          <RsvpLink e={event} />
          {navTo && <NavigateLink to={navTo} className="btn-ghost py-2" />}
          {leader && easternDate(event.starts_at) <= todayEastern() && easternDate(event.ends_at ?? event.starts_at) >= todayEastern() && !event.archived_at && (
            <a href="#attendance" className="btn-primary py-2">
              <ClipboardCheck className="h-4 w-4" aria-hidden /> {denMeeting ? "Record the meeting" : "Take attendance"}
            </a>
          )}
          {event.signup_url && (
            <a href={event.signup_url} target="_blank" rel="noopener noreferrer" className="btn-gold py-2">
              {isVideoCall(event.signup_url) ? <Video className="h-4 w-4" aria-hidden /> : <Ticket className="h-4 w-4" aria-hidden />}{" "}
              {eventLinkLabel(event.signup_url, event.source)}
            </a>
          )}
        </div>
        {!event.archived_at && <AddToCalendar eventId={id} className="btn-ghost w-full py-2" />}
      </section>
      {event.archived_at && <ArchiveControl e={event} leader={false} back={`/events/${id}`} part="note" />}
    </>
  );
  // Under the tiles: what you might need to do for this event.
  const overviewRest = (
    <>
      {elsewhere.length > 0 && (
        <section className="card space-y-2 border-l-4 border-l-gold">
          <h2 className="section-title">Meeting somewhere else tonight</h2>
          <ul className="space-y-1.5">
            {elsewhere.map((m) => (
              <li key={m.id} className="text-sm">
                <Link href={`/meetings/${m.id}`} className="font-bold text-pine underline-offset-2 hover:underline">
                  {m.den?.name}: {m.title}
                </Link>
                <span className="block text-xs text-muted">{[m.location, fmtMeetingTime(m)].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <EventRsvp e={event} me={me} />
      <PermissionSlips e={event} me={me} />
      <EventSignal e={event} me={me} />
    </>
  );

  // Leaders only: everything families don't see, as buttons in a box of their own.
  const leaderTabs = eventLeaderTabs({ e: event, me, back: `/events/${id}` });

  return (
    <>
      <BackLink href={event.archived_at ? "/events/archive" : "/events"} label={event.archived_at ? "Archive" : "Calendar"} />
      <EventTabs
        lead={overview}
        rest={overviewRest}
        label="More about this event"
        backLabel="Event"
        leaderTabs={leaderTabs}
        tabs={[
          { id: "schedule", label: "Schedule", hint: "What happens when", icon: <Clock aria-hidden />, content: <EventSchedule items={itinerary} /> },
          {
            id: "packing",
            label: "What to bring", hint: "The list for this event", icon: <Backpack aria-hidden />,
            content: packing.length ? <PackingChecklist eventId={id} items={packing} /> : null,
          },
          { id: "weather", label: "Weather", hint: "Forecast and right now", icon: <CloudSun aria-hidden />, content: <EventWeather e={event} /> },
          {
            id: "info",
            label: "Info", hint: "Details, links and photos", icon: <Info aria-hidden />,
            content: (
              <>
                <EventSections eventId={id} sections={event.sections ?? []} />
                <EventLinks links={event.links ?? []} />
                <EventPhotosLink eventId={id} startsAt={event.starts_at} />
              </>
            ),
          },
          { id: "carpool", label: "Carpool", hint: "Offer or find a ride", icon: <Car aria-hidden />, content: <EventCarpool e={event} me={me} /> },
          { id: "volunteer", label: "Volunteer", hint: "Jobs that need a grown-up", icon: <HandHelping aria-hidden />, content: <VolunteerJobs eventId={id} slots={slots} meId={me.id} leader={leader} /> },
          {
            id: "nature",
            label: "Trail guide", hint: "Bird and plant ID", icon: <Leaf aria-hidden />,
            content: <EventTrailGuide e={event} extraText={(event.sections ?? []).map((s) => JSON.stringify(s))} />,
          },
        ]}
      />
    </>
  );
}
