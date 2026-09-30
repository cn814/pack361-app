import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import EventForm from "@/components/EventForm";
import { getEvent, isLeader, requireMember } from "@/lib/data";
import { getDens } from "@/lib/roster-data";
import { easternDate, easternParts } from "@/lib/tz";

export const metadata: Metadata = { title: "Edit event" };

const hhmm = (iso: string) => {
  const p = easternParts(iso);
  return `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
};

export default async function EditEventPage({ params }: PageProps<"/events/[id]/edit">) {
  const me = await requireMember();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  if (!isLeader(me)) redirect(`/events/${id}`);
  const [e, dens] = await Promise.all([getEvent(id), getDens(false)]);
  if (!e) notFound();
  const back = e.category === "Campout" ? `/campouts/${id}` : `/events/${id}`;
  return (
    <>
      <BackLink href={back} label={e.title} />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Edit event</h1>
      <section className="card">
        <EventForm
          dens={dens.map((d) => ({ id: d.id, name: d.name }))}
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
            from_twh: e.source === "troopwebhost",
          }}
        />
      </section>
    </>
  );
}
