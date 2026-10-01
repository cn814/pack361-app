import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CalendarCheck, CalendarDays, MapPin, Trash2 } from "lucide-react";
import BackLink from "@/components/BackLink";
import MeetingForm from "@/components/MeetingForm";
import SubmitButton from "@/components/SubmitButton";
import { requireMember } from "@/lib/data";
import { denAdventures, fmtMeetingDate, fmtMeetingTime, getMeeting, goingScouts, leadsDen, meetingAdventures, todayEastern } from "@/lib/meetings";
import { createClient } from "@/lib/supabase/server";
import type { DenRank } from "@/lib/types";
import { deleteMeeting, saveMeeting } from "../actions";

export const metadata: Metadata = { title: "Den meeting" };

/**
 * A meeting planned ahead. On the day (or after), this sends leaders to the record page, so
 * there's one place to take attendance and record requirements.
 */
export default async function MeetingPage({ params }: PageProps<"/scouts/den/[denId]/meetings/[meetingId]">) {
  const me = await requireMember();
  const { denId, meetingId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(denId) || !/^[0-9a-f-]{36}$/i.test(meetingId)) notFound();
  if (!(await leadsDen(me, denId))) redirect("/scouts");
  const meeting = await getMeeting(meetingId);
  if (!meeting || meeting.den_id !== denId) notFound();
  if (meeting.meets_on <= todayEastern()) redirect(`/scouts/den/${denId}/today?meeting=${meeting.id}`);

  const supabase = await createClient();
  const [{ data: den }, { data: scoutRows }] = await Promise.all([
    supabase.from("dens").select("id, rank, name").eq("id", denId).maybeSingle(),
    supabase.from("scouts").select("id, first_name, last_name, family_id").eq("den_id", denId).eq("is_active", true).order("first_name"),
  ]);
  if (!den) notFound();
  const scouts = (scoutRows ?? []) as { id: string; first_name: string; last_name: string; family_id: string | null }[];
  const [adventures, rsvp] = await Promise.all([
    denAdventures(denId, den.rank as DenRank),
    goingScouts(denId, den.rank as DenRank, meeting.meets_on, meeting.id, scouts),
  ]);
  const going = new Set(rsvp.going);
  const advs = meetingAdventures(meeting);

  return (
    <>
      <BackLink href={`/scouts/den/${denId}/meetings`} label={`${den.name} meetings`} />
      <section className="card space-y-1.5 border-t-4 border-t-pine">
        <h1 className="text-xl font-extrabold leading-tight text-pine-950">{meeting.title}</h1>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <CalendarDays className="h-4 w-4" aria-hidden /> {fmtMeetingDate(meeting.meets_on)}
          {fmtMeetingTime(meeting) ? ` · ${fmtMeetingTime(meeting)}` : ""}
        </p>
        {(meeting.location || meeting.address) && (
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <MapPin className="h-4 w-4" aria-hidden /> {[meeting.location, meeting.address].filter(Boolean).join(", ")}
          </p>
        )}
        {advs.length > 0 && (
          <p className="text-sm text-ink">
            Working on <b>{advs.join(", ")}</b>
          </p>
        )}
        {meeting.family_note && <p className="rounded-xl bg-surface-low p-2 text-sm text-navy">{meeting.family_note}</p>}
        <p className="text-[11px] text-muted">Families in the den see this on their calendar and can say who&apos;s coming.</p>
        <p className="text-sm font-semibold text-pine">On the meeting day, open it again to tap who&apos;s here and Save.</p>
      </section>

      <section className="card space-y-2">
        <h2 className="section-title flex items-center gap-1.5">
          <CalendarCheck className="h-3.5 w-3.5" aria-hidden /> Who&apos;s coming
        </h2>
        {rsvp.answers === 0 ? (
          <p className="text-sm text-muted">No answers yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {scouts.map((s) => (
              <li key={s.id} className="flex justify-between py-1.5">
                <span className="font-semibold text-ink">
                  {s.first_name} {s.last_name.slice(0, 1)}.
                </span>
                <span className={going.has(s.id) ? "font-bold text-pine" : "text-muted"}>{going.has(s.id) ? "Going" : "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="card">
        <summary className="cursor-pointer list-none font-bold text-pine">Change the plan</summary>
        <div className="pt-3">
          <MeetingForm action={saveMeeting} denId={denId} adventures={adventures} meeting={meeting} />
        </div>
      </details>

      <form action={deleteMeeting} className="text-center">
        <input type="hidden" name="id" value={meeting.id} />
        <input type="hidden" name="den_id" value={denId} />
        <SubmitButton className="inline-flex items-center gap-1 text-sm font-semibold text-danger">
          <Trash2 className="h-4 w-4" aria-hidden /> Delete meeting
        </SubmitButton>
      </form>
    </>
  );
}
