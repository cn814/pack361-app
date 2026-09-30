import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, MapPin, Navigation, Ticket } from "lucide-react";
import BackLink from "@/components/BackLink";
import VolunteerJobs from "@/components/VolunteerJobs";
import EventPhotosLink from "@/components/EventPhotosLink";
import { EventLinks, EventSections } from "@/components/EventInfo";
import { getEvent, isLeader, requireMember } from "@/lib/data";
import { getSlots } from "@/lib/volunteer";
import { fmtRange, mapsLink } from "@/lib/format";

export const metadata: Metadata = { title: "Event" };

export default async function EventPage({ params }: PageProps<"/events/[id]">) {
  const me = await requireMember();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const event = await getEvent(id);
  if (!event) notFound();
  if (event.category === "Campout") redirect(`/campouts/${id}`);
  const slots = await getSlots(id);
  const place = [event.location_name, event.address].filter(Boolean).join(", ");

  return (
    <>
      <BackLink href="/events" label="Calendar" />
      <section className="card space-y-2 border-t-4 border-t-gold">
        <span className="badge bg-gold-50 text-gold-700">{event.category}</span>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-pine-950">{event.title}</h1>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <CalendarDays className="h-4 w-4" aria-hidden /> {fmtRange(event.starts_at, event.ends_at)}
        </p>
        {place && (
          <p className="flex items-start gap-1.5 text-sm text-muted">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {place}
          </p>
        )}
        {event.details && <p className="whitespace-pre-line pt-1 text-sm text-ink">{event.details}</p>}
        <div className="flex flex-wrap gap-2 pt-2">
          {place && (
            <a href={mapsLink(place)} target="_blank" rel="noopener noreferrer" className="btn-ghost py-2">
              <Navigation className="h-4 w-4" aria-hidden /> Directions
            </a>
          )}
          {event.signup_url && (
            <a href={event.signup_url} target="_blank" rel="noopener noreferrer" className="btn-gold py-2">
              <Ticket className="h-4 w-4" aria-hidden /> RSVP / pay
            </a>
          )}
        </div>
      </section>
      <VolunteerJobs eventId={id} slots={slots} meId={me.id} leader={isLeader(me)} />
      <EventLinks links={event.links ?? []} />
      <EventSections sections={event.sections ?? []} />
      <EventPhotosLink eventId={id} startsAt={event.starts_at} />
    </>
  );
}
