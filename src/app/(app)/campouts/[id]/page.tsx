import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Megaphone, Navigation, Ticket, Video } from "lucide-react";
import { eventLinkLabel, isVideoCall } from "@/lib/event-link";
import Link from "next/link";
import PackingChecklist from "@/components/PackingChecklist";
import BackLink from "@/components/BackLink";
import EventSignup from "@/components/EventSignup";
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
import EventTrailGuide from "@/components/EventTrailGuide";
import AddToCalendar from "@/components/AddToCalendar";
import { BuildEventLink, CopyEventButton } from "@/components/EventBuildButtons";
import { EditEventLink, EventRsvp } from "@/components/EventRsvp";
import SaveOffline from "@/components/SaveOffline";
import { getSlots } from "@/lib/volunteer";
import { EventLinks, EventSections } from "@/components/EventInfo";
import { getEvent, getItinerary, getPackingList, isLeader, requireMember } from "@/lib/data";
import { getEventCampaign, getOrders } from "@/lib/fundraising-data";
import { fmtDay, fmtRange, fmtTime, mapsLink } from "@/lib/format";

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

  const byDay = new Map<string, typeof itinerary>();
  for (const i of itinerary) byDay.set(fmtDay(i.starts_at), [...(byDay.get(fmtDay(i.starts_at)) ?? []), i]);
  const place = [event.location_name, event.address].filter(Boolean).join(", ");

  return (
    <>
      <BackLink href={event.archived_at ? "/events/archive" : "/events"} label={event.archived_at ? "Archive" : "Calendar"} />
      {event.archived_at && <ArchiveControl e={event} leader={false} back={`/campouts/${id}`} part="note" />}
      <div className="page-wide flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="contents lg:block lg:space-y-4">
        <div className="order-1 space-y-4 empty:hidden">
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
          <JumpLinks
            links={[
              ...(event.rsvp_enabled ? [{ href: "#rsvp", label: "RSVP" }] : []),
              ...(event.slip_required ? [{ href: "#slip", label: "Permission slip" }] : []),
              { href: "#packing", label: "Packing list" },
              { href: "#schedule", label: "Schedule" },
              ...(slots.length ? [{ href: "#volunteer", label: "Volunteer" }] : []),
            ]}
          />
          <EventAttendance e={event} me={me} />
        </div>
        <div className="order-3 empty:hidden">
          {campaign && (
            <EventSignup
              campaign={campaign}
              orders={orders}
              myFamilyId={me.family_id}
              leader={isLeader(me)}
              signupUrl={event.signup_url}
            />
          )}
        </div>
        <div className="order-5 empty:hidden">
          <section id="schedule" className="scroll-mt-20 space-y-3">
            <h2 className="section-title">Schedule</h2>
            {itinerary.length === 0 ? (
              <p className="card text-sm text-muted">The camping chair hasn&apos;t posted the schedule yet.</p>
            ) : (
              [...byDay.entries()].map(([day, items]) => (
                <div key={day} className="card space-y-3">
                  <h3 className="font-bold text-pine-950">{day}</h3>
                  <ol className="space-y-3">
                    {items.map((i) => (
                      <li key={i.id} className="flex gap-3">
                        <span className="w-16 shrink-0 text-xs font-bold text-gold-800">{fmtTime(i.starts_at)}</span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-ink">{i.title}</span>
                          {(i.location || i.notes) && (
                            <span className="block text-xs text-muted">{[i.location, i.notes].filter(Boolean).join(" · ")}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))
            )}
          </section>
        </div>
        <div className="order-9 space-y-4 empty:hidden">
          <EventSections eventId={id} sections={event.sections ?? []} />
          <EventTrailGuide e={event} />
        </div>
        </div>
        <div className="contents lg:block lg:space-y-4">
        <div className="order-2 space-y-4 empty:hidden">
          <EventWeather e={event} />
          <EventRsvp e={event} me={me} />
          <ReadyToGo e={event} me={me} />
          <EventSignal e={event} me={me} />
          <EventCarpool e={event} me={me} />
          <PermissionSlips e={event} me={me} />
        </div>
        <div className="order-4 empty:hidden">
          <section id="packing" className="scroll-mt-20 space-y-3">
            <h2 className="section-title">Packing checklist</h2>
            <PackingChecklist eventId={event.id} items={packing} />
          </section>
        </div>
        <div className="order-6 empty:hidden">
          <VolunteerJobs eventId={id} slots={slots} meId={me.id} leader={isLeader(me)} />
        </div>
        <div className="order-7 empty:hidden">
          <SaveOffline />
        </div>
        <div className="order-8 empty:hidden">
          <EventLinks links={event.links ?? []} />
        </div>
        <div className="order-10 empty:hidden">
          <EventPhotosLink eventId={id} startsAt={event.starts_at} />
        </div>
        </div>
      </div>
      <EditEventLink e={event} me={me} />
      <BuildEventLink e={event} me={me} />
      <CopyEventButton e={event} me={me} />
      <ArchiveControl e={event} leader={isLeader(me)} back={`/campouts/${id}`} part="button" />
    </>
  );
}
