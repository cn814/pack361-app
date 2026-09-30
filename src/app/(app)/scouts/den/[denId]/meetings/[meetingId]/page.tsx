import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, CircleCheck, MapPin, Stamp, Trash2 } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import BackLink from "@/components/BackLink";
import MeetingForm from "@/components/MeetingForm";
import SubmitButton from "@/components/SubmitButton";
import { requireMember } from "@/lib/data";
import { denAdventures, fmtMeetingDate, fmtMeetingTime, getMeeting, leadsDen, todayEastern } from "@/lib/meetings";
import { createClient } from "@/lib/supabase/server";
import type { DenRank } from "@/lib/types";
import { deleteMeeting, recordMeeting, saveAttendance, saveMeeting } from "../actions";

export const metadata: Metadata = { title: "Den meeting" };

export default async function MeetingPage({ params }: PageProps<"/scouts/den/[denId]/meetings/[meetingId]">) {
  const me = await requireMember();
  const { denId, meetingId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(denId) || !/^[0-9a-f-]{36}$/i.test(meetingId)) notFound();
  if (!(await leadsDen(me, denId))) redirect("/scouts");
  const meeting = await getMeeting(meetingId);
  if (!meeting || meeting.den_id !== denId) notFound();

  const supabase = await createClient();
  const [{ data: den }, { data: scouts }] = await Promise.all([
    supabase.from("dens").select("id, rank, name").eq("id", denId).maybeSingle(),
    supabase.from("scouts").select("id, first_name, last_name").eq("den_id", denId).eq("is_active", true).order("first_name"),
  ]);
  if (!den) notFound();
  const adventures = await denAdventures(denId, den.rank as DenRank);
  const present = new Set((meeting.attendance ?? []).map((a) => a.scout_id));
  const happened = meeting.meets_on <= todayEastern();
  const canRecord = happened && meeting.adventure && meeting.requirements.length > 0;

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
        {meeting.adventure && (
          <p className="text-sm text-ink">
            <b>{meeting.adventure}</b>
            {meeting.requirements.length > 0 && <> · requirement{meeting.requirements.length > 1 ? "s" : ""} {meeting.requirements.join(", ")}</>}
          </p>
        )}
        {meeting.family_note && <p className="rounded-xl bg-surface-low p-2 text-sm text-navy">{meeting.family_note}</p>}
        <p className="text-[11px] text-muted">
          Families in the den see this on their calendar and their scout&apos;s page (not attendance).
        </p>
      </section>

      <section className="card space-y-2">
        <h2 className="section-title">Who was there</h2>
        {!happened && <p className="text-xs text-muted">You can take attendance now or at the meeting.</p>}
        <ActionForm action={saveAttendance} submit="Save attendance">
          <input type="hidden" name="meeting_id" value={meeting.id} />
          <ul className="divide-y divide-line">
            {(scouts ?? []).map((s) => (
              <li key={s.id}>
                <label className="flex items-center gap-3 py-2.5">
                  <input type="checkbox" name="present" value={s.id} defaultChecked={present.has(s.id)} className="h-5 w-5 accent-pine" />
                  <span className="font-semibold text-ink">
                    {s.first_name} {s.last_name}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </ActionForm>
      </section>

      {meeting.adventure && meeting.requirements.length > 0 && (
        <section className="card space-y-2">
          <h2 className="section-title flex items-center gap-1.5">
            <Stamp className="h-3.5 w-3.5" aria-hidden /> Report requirements
          </h2>
          {meeting.recorded_at && (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-pine">
              <CircleCheck className="h-4 w-4" aria-hidden /> Reported. Report again if you changed attendance; nothing is doubled.
            </p>
          )}
          <p className="text-sm text-muted">
            Marks {meeting.adventure} requirement{meeting.requirements.length > 1 ? "s" : ""} {meeting.requirements.join(", ")} as done
            and approved for the {present.size} scout{present.size === 1 ? "" : "s"} checked above. Anything already in Scoutbook is
            skipped. The advancement chair then enters them in Scoutbook.
          </p>
          {canRecord ? (
            <ActionForm action={recordMeeting} submit={meeting.recorded_at ? "Report again" : "Report for everyone here"} busy="Reporting…">
              <input type="hidden" name="meeting_id" value={meeting.id} />
            </ActionForm>
          ) : (
            <p className="text-xs font-semibold text-gold-800">Available on the meeting date, after attendance is saved.</p>
          )}
        </section>
      )}

      <details className="card">
        <summary className="cursor-pointer list-none font-bold text-pine">Edit meeting</summary>
        <div className="pt-3">
          <MeetingForm action={saveMeeting} denId={denId} adventures={adventures} meeting={meeting} />
        </div>
      </details>

      {!meeting.recorded_at && (
        <form action={deleteMeeting} className="text-center">
          <input type="hidden" name="id" value={meeting.id} />
          <input type="hidden" name="den_id" value={denId} />
          <SubmitButton className="inline-flex items-center gap-1 text-sm font-semibold text-danger">
            <Trash2 className="h-4 w-4" aria-hidden /> Delete meeting
          </SubmitButton>
        </form>
      )}
    </>
  );
}
