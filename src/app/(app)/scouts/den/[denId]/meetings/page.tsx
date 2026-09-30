import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarPlus, ChevronRight, CircleCheck, Users } from "lucide-react";
import BackLink from "@/components/BackLink";
import MeetingForm from "@/components/MeetingForm";
import { requireMember } from "@/lib/data";
import { denAdventures, fmtMeetingDate, getMeetings, leadsDen, todayEastern } from "@/lib/meetings";
import { createClient } from "@/lib/supabase/server";
import type { DenRank } from "@/lib/types";
import { saveMeeting } from "./actions";

export const metadata: Metadata = { title: "Den meetings" };

export default async function MeetingsPage({ params }: PageProps<"/scouts/den/[denId]/meetings">) {
  const me = await requireMember();
  const { denId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(denId)) notFound();
  if (!(await leadsDen(me, denId))) redirect("/scouts");
  const supabase = await createClient();
  const { data: den } = await supabase.from("dens").select("id, rank, name").eq("id", denId).maybeSingle();
  if (!den) notFound();
  const [meetings, adventures] = await Promise.all([getMeetings(denId), denAdventures(denId, den.rank as DenRank)]);
  const today = todayEastern();
  const upcoming = meetings.filter((m) => m.meets_on >= today).reverse();
  const past = meetings.filter((m) => m.meets_on < today);
  const needsRecording = past.filter((m) => !m.recorded_at && m.adventure && m.requirements.length);

  return (
    <>
      <BackLink href={`/scouts/den/${denId}`} label={`${den.name} progress`} />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">{den.name} meetings</h1>

      {needsRecording.length > 0 && (
        <p className="rounded-2xl border border-gold-100 bg-gold-50 p-3 text-sm text-gold-800">
          {needsRecording.length} past meeting{needsRecording.length === 1 ? " needs" : "s need"} attendance and requirements
          reported. Tap {needsRecording.length === 1 ? "it" : "one"} below.
        </p>
      )}

      <details className="card" open={meetings.length === 0}>
        <summary className="flex cursor-pointer list-none items-center gap-2 font-bold text-pine">
          <CalendarPlus className="h-5 w-5" aria-hidden /> Plan a meeting
        </summary>
        <div className="pt-3">
          <MeetingForm action={saveMeeting} denId={denId} adventures={adventures} defaultDate={today} />
        </div>
      </details>

      <MeetingList title="Coming up" meetings={upcoming} denId={denId} empty="Nothing planned yet." />
      <MeetingList title="Past meetings" meetings={past} denId={denId} />
    </>
  );
}

function MeetingList({
  title,
  meetings,
  denId,
  empty,
}: {
  title: string;
  meetings: Awaited<ReturnType<typeof getMeetings>>;
  denId: string;
  empty?: string;
}) {
  if (!meetings.length && !empty) return null;
  return (
    <section className="space-y-2">
      <h2 className="section-title">{title}</h2>
      {!meetings.length && <p className="card text-sm text-muted">{empty}</p>}
      {meetings.map((m) => (
        <Link key={m.id} href={`/scouts/den/${denId}/meetings/${m.id}`} className="card flex items-center gap-3 py-3">
          <span className="w-14 shrink-0 text-center text-xs font-extrabold uppercase text-gold-800">{fmtMeetingDate(m.meets_on)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold text-ink">{m.title}</span>
            <span className="flex items-center gap-2 text-xs text-muted">
              {m.adventure && m.requirements.length > 0 && <span>Req {m.requirements.join(", ")}</span>}
              {(m.attendance?.length ?? 0) > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <Users className="h-3 w-3" aria-hidden /> {m.attendance!.length}
                </span>
              )}
              {m.recorded_at && (
                <span className="inline-flex items-center gap-0.5 font-semibold text-pine">
                  <CircleCheck className="h-3 w-3" aria-hidden /> reported
                </span>
              )}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
        </Link>
      ))}
    </section>
  );
}
