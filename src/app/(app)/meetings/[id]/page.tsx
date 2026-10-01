import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ClipboardList, Clock, MapPin, Navigation } from "lucide-react";
import BackLink from "@/components/BackLink";
import DenMeetingRsvp from "@/components/DenMeetingRsvp";
import { getMyScouts, requireMember } from "@/lib/data";
import { fmtMeetingDate, fmtMeetingTime, getMeeting, leadsDen, meetingAdventures, myMeetingRsvps, todayEastern } from "@/lib/meetings";
import { createClient } from "@/lib/supabase/server";
import { mapsLink } from "@/lib/format";

export const metadata: Metadata = { title: "Den meeting" };

/** A den meeting as families see it: when, where, what to bring. */
export default async function MeetingInfoPage({ params }: PageProps<"/meetings/[id]">) {
  const me = await requireMember();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const meeting = await getMeeting(id); // RLS: this den's families and leaders only
  if (!meeting) notFound();
  const supabase = await createClient();
  const { data: den } = await supabase.from("dens").select("name, meeting_info").eq("id", meeting.den_id).maybeSingle();
  const time = fmtMeetingTime(meeting);
  const place = [meeting.location, meeting.address].filter(Boolean).join(", ");
  const [manage, myScouts] = await Promise.all([leadsDen(me, meeting.den_id), getMyScouts()]);
  const upcoming = meeting.meets_on >= todayEastern();
  const rsvps = upcoming ? await myMeetingRsvps(meeting, myScouts) : [];
  const advs = meetingAdventures(meeting);

  return (
    <>
      <BackLink href="/events" label="Events" />
      <section className="card space-y-2 border-t-4 border-t-navy">
        <div className="flex flex-wrap gap-2">
          <span className="badge bg-navy text-white">Den meeting</span>
          {den && <span className="badge bg-gold-50 text-gold-800">{den.name}</span>}
        </div>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-pine-950">{meeting.title}</h1>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <CalendarDays className="h-4 w-4" aria-hidden /> {fmtMeetingDate(meeting.meets_on)}
        </p>
        {time && (
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <Clock className="h-4 w-4" aria-hidden /> {time}
          </p>
        )}
        {place ? (
          <p className="flex items-start gap-1.5 text-sm text-muted">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {place}
          </p>
        ) : (
          den?.meeting_info && (
            <p className="flex items-start gap-1.5 text-sm text-muted">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Usual spot: {den.meeting_info}
            </p>
          )
        )}
        {advs.length > 0 && (
          <p className="text-sm text-ink">
            Working on <b>{advs.join(", ")}</b>
          </p>
        )}
        {meeting.family_note && <p className="whitespace-pre-line rounded-xl bg-gold-50 p-3 text-sm text-gold-800">{meeting.family_note}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          {place && (
            <a href={mapsLink(place)} target="_blank" rel="noopener noreferrer" className="btn-ghost py-2">
              <Navigation className="h-4 w-4" aria-hidden /> Directions
            </a>
          )}
          {manage && (
            <Link
              href={
                meeting.meets_on <= todayEastern()
                  ? `/scouts/den/${meeting.den_id}/today?meeting=${meeting.id}`
                  : `/scouts/den/${meeting.den_id}/meetings/${meeting.id}`
              }
              className="btn-primary py-2"
            >
              <ClipboardList className="h-4 w-4" aria-hidden /> {meeting.meets_on <= todayEastern() ? "Record this meeting" : "Edit plan"}
            </Link>
          )}
        </div>
      </section>
      <DenMeetingRsvp meetingId={meeting.id} scouts={rsvps} />
    </>
  );
}
