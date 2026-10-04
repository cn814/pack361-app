import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, MapPin, Megaphone, Navigation, Ticket, Video } from "lucide-react";
import { eventLinkLabel, isVideoCall } from "@/lib/event-link";
import BackLink from "@/components/BackLink";
import VolunteerJobs from "@/components/VolunteerJobs";
import RsvpLink from "@/components/RsvpLink";
import JumpLinks from "@/components/JumpLinks";
import EventPhotosLink from "@/components/EventPhotosLink";
import ArchiveControl from "@/components/ArchiveControl";
import EventAttendance from "@/components/EventAttendance";
import PermissionSlips from "@/components/PermissionSlips";
import EventSignal from "@/components/EventSignal";
import EventCarpool from "@/components/EventCarpool";
import ReadyToGo from "@/components/ReadyToGo";
import EventWeather from "@/components/EventWeather";
import EventPlan from "@/components/EventPlan";
import AddToCalendar from "@/components/AddToCalendar";
import { BuildEventLink, CopyEventButton } from "@/components/EventBuildButtons";
import { EditEventLink, EventRsvp } from "@/components/EventRsvp";
import { EventLinks, EventSections } from "@/components/EventInfo";
import { getEvent, isLeader, requireMember } from "@/lib/data";
import { getSlots } from "@/lib/volunteer";
import { easternDate, ranksLabel } from "@/lib/calendar";
import { fmtMeetingTime } from "@/lib/meetings";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { fmtRange, mapsLink } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/events/[id]">): Promise<Metadata> {
  const { id } = await params;
  const { eventTitle } = await import("@/lib/page-titles");
  return { title: (await eventTitle(id)) ?? "Event" };
}

export default async function EventPage({ params }: PageProps<"/events/[id]">) {
  const me = await requireMember();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // The volunteer jobs don't depend on the event row: read both at once.
  const [event, slots] = await Promise.all([getEvent(id), getSlots(id)]);
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

  return (
    <>
      <BackLink href={event.archived_at ? "/events/archive" : "/events"} label={event.archived_at ? "Archive" : "Calendar"} />
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
        {event.details && <p className="whitespace-pre-line pt-1 text-sm text-ink">{event.details}</p>}
        <div className="flex flex-wrap gap-2 pt-2">
          <RsvpLink e={event} />
          {place && (
            <a href={mapsLink(place)} target="_blank" rel="noopener noreferrer" className="btn-ghost py-2">
              <Navigation className="h-4 w-4" aria-hidden /> Directions
            </a>
          )}
          {event.signup_url && (
            <a href={event.signup_url} target="_blank" rel="noopener noreferrer" className="btn-gold py-2">
              {isVideoCall(event.signup_url) ? <Video className="h-4 w-4" aria-hidden /> : <Ticket className="h-4 w-4" aria-hidden />}{" "}
              {eventLinkLabel(event.signup_url, event.source)}
            </a>
          )}
          {isLeader(me) && event.rsvp_enabled && (
            <Link href={`/announce?event=${id}`} className="btn-ghost py-2">
              <Megaphone className="h-4 w-4" aria-hidden /> Message families
            </Link>
          )}
        </div>
        {!event.archived_at && <AddToCalendar eventId={id} className="btn-ghost w-full py-2" />}
      </section>
      {event.archived_at && <ArchiveControl e={event} leader={false} back={`/events/${id}`} part="note" />}
      <JumpLinks
        links={[
          ...(event.rsvp_enabled ? [{ href: "#rsvp", label: "RSVP" }] : []),
          ...(event.slip_required ? [{ href: "#slip", label: "Permission slip" }] : []),
          ...(slots.length ? [{ href: "#volunteer", label: "Volunteer" }] : []),
        ]}
      />
      <EventAttendance e={event} me={me} />
      <EventWeather e={event} />
      {elsewhere.length > 0 && (
        <section className="card space-y-2 border-l-4 border-l-gold">
          <h2 className="section-title">Meeting somewhere else tonight</h2>
          <ul className="space-y-1.5">
            {elsewhere.map((m) => (
              <li key={m.id} className="text-sm">
                <Link href={`/meetings/${m.id}`} className="font-bold text-pine underline-offset-2 hover:underline">
                  {m.den?.name}: {m.title}
                </Link>
                <span className="block text-xs text-muted">
                  {[m.location, fmtMeetingTime(m)].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <EventRsvp e={event} me={me} />
      <ReadyToGo e={event} me={me} />
      <EventSignal e={event} me={me} />
      <EventCarpool e={event} me={me} />
      <PermissionSlips e={event} me={me} />
      <VolunteerJobs eventId={id} slots={slots} meId={me.id} leader={isLeader(me)} />
      <EventPlan eventId={id} />
      <EventLinks links={event.links ?? []} />
      <EventSections eventId={id} sections={event.sections ?? []} />
      <EventPhotosLink eventId={id} startsAt={event.starts_at} />
      <EditEventLink e={event} me={me} />
      <BuildEventLink e={event} me={me} />
      <CopyEventButton e={event} me={me} />
      <ArchiveControl e={event} leader={isLeader(me)} back={`/events/${id}`} part="button" />
    </>
  );
}
