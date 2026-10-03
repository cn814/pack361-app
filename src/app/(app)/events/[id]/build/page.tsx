import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Eye, Pencil } from "lucide-react";
import BackLink from "@/components/BackLink";
import JumpLinks from "@/components/JumpLinks";
import ScheduleEditor, { type DayOption, type ScheduleRow } from "@/components/event-builder/ScheduleEditor";
import PackingEditor from "@/components/event-builder/PackingEditor";
import SectionsEditor from "@/components/event-builder/SectionsEditor";
import LinksEditor from "@/components/event-builder/LinksEditor";
import StartFromPast from "@/components/event-builder/StartFromPast";
import { getEvent, getItinerary, isLeader, requireMember } from "@/lib/data";
import { getOwnPackingList, getPlanSources, getStandardPackingCount } from "@/lib/event-builder-data";
import { addDays, daysBetween, easternDate, easternParts } from "@/lib/tz";
import { easternToIso } from "@/lib/calendar";
import { fmtDay, fmtRange, fmtTime } from "@/lib/format";

export const metadata: Metadata = { title: "Build event" };

const hhmm = (iso: string) => {
  const p = easternParts(iso);
  return `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
};
/** "Sat, Oct 24" for a YYYY-MM-DD date (noon, so it's the right day in Eastern time). */
const dayLabel = (date: string) => fmtDay(easternToIso(date, "12:00"));

/** Leaders: build the schedule, packing list, info sections and links for a campout or any event. */
export default async function BuildEventPage({ params }: PageProps<"/events/[id]/build">) {
  const me = await requireMember();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  if (!isLeader(me)) redirect(`/events/${id}`);
  const [event, itinerary, packing, standardCount, sources] = await Promise.all([
    getEvent(id),
    getItinerary(id),
    getOwnPackingList(id),
    getStandardPackingCount(),
    getPlanSources(id),
  ]);
  if (!event) notFound();
  const campout = event.category === "Campout";
  const back = campout ? `/campouts/${id}` : `/events/${id}`;

  // The event's days (for picking a schedule item's day), up to two weeks.
  const first = easternDate(event.starts_at);
  const lastDay = easternDate(event.ends_at ?? event.starts_at);
  const span = Math.min(Math.max(daysBetween(first, lastDay), 0), 13);
  const days: DayOption[] = Array.from({ length: span + 1 }, (_, n) => {
    const d = addDays(first, n);
    return { value: d, label: dayLabel(d) };
  });
  const schedule: ScheduleRow[] = itinerary.map((i) => ({
    id: i.id,
    date: easternDate(i.starts_at),
    time: hhmm(i.starts_at),
    dayLabel: fmtDay(i.starts_at),
    timeLabel: fmtTime(i.starts_at),
    title: i.title,
    location: i.location,
    notes: i.notes,
  }));
  const sections = event.sections ?? [];
  const links = event.links ?? [];

  return (
    <>
      <BackLink href={back} label={event.title} />
      <div className="space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Build this {campout ? "campout" : "event"}</h1>
        <p className="text-sm text-muted">
          {event.title} · {fmtRange(event.starts_at, event.ends_at, event.all_day)}
        </p>
        <p className="text-sm text-muted">Everything saves as you go. Families see changes right away.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={back} className="btn-ghost py-2">
          <Eye className="h-4 w-4" aria-hidden /> See it as families do
        </Link>
        <Link href={`/events/${id}/edit`} className="btn-ghost py-2">
          <Pencil className="h-4 w-4" aria-hidden /> Edit date, place and cost
        </Link>
      </div>
      <JumpLinks
        links={[
          { href: "#schedule", label: "Schedule" },
          { href: "#packing", label: "Packing list" },
          { href: "#sections", label: "Info sections" },
          { href: "#links", label: "Links" },
          ...(sources.length ? [{ href: "#start", label: "Start from a past event" }] : []),
        ]}
      />
      <div className="page-wide flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="space-y-4">
          <StartFromPast
            eventId={id}
            has={{ schedule: itinerary.length, packing: packing.length, sections: sections.length, links: links.length }}
            sources={sources.map((s) => ({
              id: s.id,
              label: `${s.title} · ${fmtDay(s.starts_at)}, ${easternDate(s.starts_at).slice(0, 4)}`,
              schedule: s.schedule,
              packing: s.packing,
              sections: s.sections,
              links: s.links,
            }))}
          />
          <ScheduleEditor eventId={id} items={schedule} days={days} />
          <PackingEditor eventId={id} items={packing} campout={campout} standardCount={standardCount} />
        </div>
        <div className="space-y-4">
          <SectionsEditor eventId={id} sections={sections} />
          <LinksEditor eventId={id} links={links} />
        </div>
      </div>
    </>
  );
}
