import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import EventForm from "@/components/EventForm";
import { getEvent, isLeader, requireMember } from "@/lib/data";
import { getDens } from "@/lib/roster-data";
import { getDocuments } from "@/lib/documents";
import { easternDate, easternParts } from "@/lib/tz";
import { getEventExtras } from "@/lib/event-builder-data";

export const metadata: Metadata = { title: "Edit event" };

const hhmm = (iso: string) => {
  const p = easternParts(iso);
  return `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
};

export default async function EditEventPage({ params, searchParams }: PageProps<"/events/[id]/edit">) {
  const me = await requireMember();
  const { id } = await params;
  const { copied } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  if (!isLeader(me)) redirect(`/events/${id}`);
  const [e, dens, docs, extras] = await Promise.all([getEvent(id), getDens(false), getDocuments(), getEventExtras(id)]);
  if (!e) notFound();
  const back = e.category === "Campout" ? `/campouts/${id}` : `/events/${id}`;
  return (
    <>
      <BackLink href={back} label={e.title} />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Edit event</h1>
      <section className="card">
        <EventForm
          dens={dens.map((d) => ({ id: d.id, name: d.name }))}
          documents={docs.filter((d) => d.audience === "everyone" || d.id === e.slip_document_id).map((d) => ({ id: d.id, title: d.title }))}
          v={{
            id: e.id,
            title: e.title,
            category: e.category,
            all_day: e.all_day,
            start_date: easternDate(e.starts_at),
            start_time: e.all_day ? undefined : hhmm(e.starts_at),
            end_date: e.ends_at ? easternDate(e.ends_at) : undefined,
            end_time: e.ends_at && !e.all_day ? hhmm(e.ends_at) : undefined,
            location_name: e.location_name,
            address: e.address,
            details: e.details,
            signup_url: e.signup_url,
            den_id: e.den_id,
            ranks: e.ranks ?? null,
            rsvp_enabled: e.rsvp_enabled,
            rsvp_by: e.rsvp_by,
            fee_family_cents: e.fee_family_cents,
            fee_scout_cents: e.fee_scout_cents,
            fee_adult_cents: e.fee_adult_cents,
            camping_nights: e.camping_nights ?? null,
            public_on_join: Boolean(e.public_on_join),
            public_blurb: e.public_blurb ?? null,
            slip_required: Boolean(e.slip_required),
            slip_text: e.slip_text ?? null,
            slip_document_id: e.slip_document_id ?? null,
            slip_due: e.slip_due ?? null,
            from_twh: e.source === "troopwebhost",
            from_council: e.source === "council",
            rsvp_limit: extras.rsvp_limit,
            series_upcoming: extras.series_upcoming,
            copied: copied === "1",
          }}
        />
      </section>
    </>
  );
}
