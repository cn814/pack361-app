import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Megaphone, Ticket, Video } from "lucide-react";
import { eventLinkLabel, isVideoCall } from "@/lib/event-link";
import Link from "next/link";
import PackingChecklist from "@/components/PackingChecklist";
import BackLink from "@/components/BackLink";
import NavigateLink from "@/components/NavigateLink";
import { navDestination } from "@/lib/navigate";
import EventSignup from "@/components/EventSignup";
import VolunteerJobs from "@/components/VolunteerJobs";
import RsvpLink from "@/components/RsvpLink";
import EventTabs from "@/components/EventTabs";
import EventSchedule from "@/components/EventSchedule";
import ClampText from "@/components/ClampText";
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
import SaveOffline from "@/components/SaveOffline";
import { getSlots } from "@/lib/volunteer";
import { EventLinks, EventSections } from "@/components/EventInfo";
import { getEvent, getItinerary, getPackingList, isLeader, requireMember } from "@/lib/data";
import { getEventCampaign, getOrders } from "@/lib/fundraising-data";
import { fmtRange } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/campouts/[id]">): Promise<Metadata> {
  const { id } = await params;
  const { eventTitle } = await import("@/lib/page-titles");
  return { title: (await eventTitle(id)) ?? "Campout" };
}

export default async function CampoutPage({ params }: PageProps<"/campouts/[id]">) {
  const me = await requireMember();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // Everything on the page keys off the id, so read it all at once (the sign-up orders follow
  // their campaign).
  const campaignP = getEventCampaign(id);
  const [event, itinerary, packing, campaign, orders, slots] = await Promise.all([
    getEvent(id),
    getItinerary(id),
    getPackingList(id),
    campaignP,
    campaignP.then((c) => (c ? getOrders([c.id]) : [])),
    getSlots(id),
  ]);
  if (!event) notFound();

  const place = [event.location_name, event.address].filter(Boolean).join(", ");
  const navTo = navDestination({ address: event.address, location_name: event.location_name });
  const leader = isLeader(me);

  const overview = (
    <>
      <section className="card space-y-2 border-t-4 border-t-pine">
        <span className="badge bg-mint text-pine">{event.category}</span>
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
          {event.signup_url && (
            <a href={event.signup_url} target="_blank" rel="noopener noreferrer" className="btn-gold py-2">
              {isVideoCall(event.signup_url) ? <Video className="h-4 w-4" aria-hidden /> : <Ticket className="h-4 w-4" aria-hidden />}{" "}
              {eventLinkLabel(event.signup_url, event.source)}
            </a>
          )}
        </div>
        {!event.archived_at && <AddToCalendar eventId={id} className="btn-ghost w-full py-2" />}
      </section>
      {campaign && <EventSignup campaign={campaign} orders={orders} myFamilyId={me.family_id} leader={leader} signupUrl={event.signup_url} />}
      <EventRsvp e={event} me={me} />
      <ReadyToGo e={event} me={me} />
      <PermissionSlips e={event} me={me} />
      <EventSignal e={event} me={me} />
      <SaveOffline />
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
      <ArchiveControl e={event} leader={leader} back={`/campouts/${id}`} part="button" />
    </>
  ) : null;

  return (
    <>
      <BackLink href={event.archived_at ? "/events/archive" : "/events"} label={event.archived_at ? "Archive" : "Calendar"} />
      {event.archived_at && <ArchiveControl e={event} leader={false} back={`/campouts/${id}`} part="note" />}
      <EventTabs
        tabs={[
          { id: "overview", label: "Overview", content: overview },
          { id: "leaders", label: "Leaders", content: leaderTab },
          {
            id: "schedule",
            label: "Schedule",
            content: <EventSchedule items={itinerary} empty="The camping chair hasn't posted the schedule yet." />,
          },
          {
            id: "packing",
            label: "Packing list",
            content: packing.length ? <PackingChecklist eventId={event.id} items={packing} /> : null,
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
          { id: "nature", label: "Trail guide", content: <EventTrailGuide e={event} /> },
        ]}
      />
    </>
  );
}
