import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, ClipboardCheck, MapPin, Megaphone, Ticket, Video } from "lucide-react";
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
import EventAttendance from "@/components/EventAttendance";
import MeetingNotes from "@/components/MeetingNotes";
import PermissionSlips from "@/components/PermissionSlips";
import EventSignal from "@/components/EventSignal";
import EventCarpool from "@/components/EventCarpool";
import ReadyToGo from "@/components/ReadyToGo";
import EventWeather from "@/components/EventWeather";
import EventTrailGuide from "@/components/EventTrailGuide";
import AddToCalendar from "@/components/AddToCalendar";
import { BuildEventLink, CopyEventButton } from "@/components/EventBuildButtons";
import { EditEventLink, EventRsvp } from "@/components/EventRsvp";
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

  const overview = (
    <>
      <section className="card space-y-2 border-t-4 border-t-gold">
        <div className="flex flex-wrap gap-2">
          <span className="badge bg-gold-50 text-gold-700">{event.category}</span>
          {audience && <span className="badge bg-deep-navy text-white">For {audience}</span>}
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
            <a href="#leaders" className="btn-primary py-2">
              <ClipboardCheck className="h-4 w-4" aria-hidden /> Take attendance
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
      <ReadyToGo e={event} me={me} />
      <PermissionSlips e={event} me={me} />
      <EventSignal e={event} me={me} />
    </>
  );

  // Leaders only: attendance (from the day of), notes, messaging families, and editing.
  const leaderTab = leader ? (
    <>
      <EventAttendance e={event} me={me} />
      <MeetingNotes target={{ eventId: id }} />
      {event.rsvp_enabled && (
        <Link href={`/announce?event=${id}`} className="btn-ghost w-full py-2.5">
          <Megaphone className="h-4 w-4" aria-hidden /> Message families
        </Link>
      )}
      <EditEventLink e={event} me={me} />
      <BuildEventLink e={event} me={me} />
      <CopyEventButton e={event} me={me} />
      <ArchiveControl e={event} leader={leader} back={`/events/${id}`} part="button" />
    </>
  ) : null;

  return (
    <>
      <BackLink href={event.archived_at ? "/events/archive" : "/events"} label={event.archived_at ? "Archive" : "Calendar"} />
      <EventTabs
        tabs={[
          { id: "overview", label: "Overview", content: overview },
          { id: "leaders", label: "Leaders", content: leaderTab },
          { id: "schedule", label: "Schedule", content: <EventSchedule items={itinerary} /> },
          {
            id: "packing",
            label: "What to bring",
            content: packing.length ? <PackingChecklist eventId={id} items={packing} /> : null,
          },
          { id: "weather", label: "Weather", content: <EventWeather e={event} /> },
          {
            id: "info",
            label: "Info",
            content: (
              <>
                <EventSections eventId={id} sections={event.sections ?? []} />
                <EventLinks links={event.links ?? []} />
                <EventPhotosLink eventId={id} startsAt={event.starts_at} />
              </>
            ),
          },
          { id: "carpool", label: "Carpool", content: <EventCarpool e={event} me={me} /> },
          { id: "volunteer", label: "Volunteer", content: <VolunteerJobs eventId={id} slots={slots} meId={me.id} leader={leader} /> },
          {
            id: "nature",
            label: "Trail guide",
            content: <EventTrailGuide e={event} extraText={(event.sections ?? []).map((s) => JSON.stringify(s))} />,
          },
        ]}
      />
    </>
  );
}
