import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import RecordMeeting from "@/components/RecordMeeting";
import { requireMember } from "@/lib/data";
import { denAdventures, fmtMeetingDate, getMeeting, getMeetingOn, goingScouts, leadsDen, todayEastern } from "@/lib/meetings";
import { createClient } from "@/lib/supabase/server";
import type { DenRank } from "@/lib/types";

export const metadata: Metadata = { title: "Record a den meeting" };

/**
 * Record a den meeting in one go: who's here, what they worked on, Save. No planning needed:
 * uses the den's meeting for that day if there is one, otherwise Save makes it.
 * ?date=YYYY-MM-DD for an earlier day, ?meeting=<id> to open a saved meeting.
 */
export default async function RecordMeetingPage({ params, searchParams }: PageProps<"/scouts/den/[denId]/today">) {
  const me = await requireMember();
  const { denId } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(denId)) notFound();
  if (!(await leadsDen(me, denId))) redirect("/scouts");
  const today = todayEastern();
  const want = typeof sp.meeting === "string" && /^[0-9a-f-]{36}$/i.test(sp.meeting) ? sp.meeting : null;
  let day = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;

  const supabase = await createClient();
  const [{ data: den }, { data: scoutRows }, found] = await Promise.all([
    supabase.from("dens").select("id, rank, name").eq("id", denId).maybeSingle(),
    supabase.from("scouts").select("id, first_name, last_name, family_id").eq("den_id", denId).eq("is_active", true).order("first_name"),
    want ? getMeeting(want) : getMeetingOn(denId, day),
  ]);
  if (!den) notFound();

  let meeting = found;
  if (want && meeting) {
    if (meeting.den_id !== denId) notFound();
    // Planned for later: nothing to record yet.
    if (meeting.meets_on > today) redirect(`/scouts/den/${denId}/meetings/${meeting.id}`);
    day = meeting.meets_on;
  } else if (want) {
    meeting = await getMeetingOn(denId, day);
  }

  const scouts = (scoutRows ?? []) as { id: string; first_name: string; last_name: string; family_id: string | null }[];
  const attended = (meeting?.attendance ?? []).map((a) => a.scout_id);
  // A scout who was here but has since moved dens still shows on a saved meeting.
  const missing = attended.filter((id) => !scouts.some((s) => s.id === id));
  if (missing.length) {
    const { data } = await supabase.from("scouts").select("id, first_name, last_name, family_id").in("id", missing);
    scouts.push(...((data ?? []) as typeof scouts));
  }

  const [adventures, rsvp] = await Promise.all([
    denAdventures(denId, den.rank as DenRank),
    attended.length || meeting?.recorded_at ? null : goingScouts(denId, den.rank as DenRank, day, meeting?.id ?? null, scouts),
  ]);
  const present = attended.length || meeting?.recorded_at ? attended : (rsvp?.going ?? []);
  const presentNote =
    rsvp && rsvp.answers > 0
      ? `Checked from RSVPs: ${rsvp.going.length} said going. Tap to change.`
      : null;

  const dayLabel = day === today ? `Today, ${fmtMeetingDate(day)}` : fmtMeetingDate(day);
  return (
    <>
      <BackLink href={`/scouts/den/${denId}`} label={den.name} />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">{den.name} meeting</h1>
      {/* Keyed on the day, not the meeting: the first Save of a new meeting must keep its "Saved" screen. */}
      <RecordMeeting
        key={day}
        denId={denId}
        day={day}
        today={today}
        dayLabel={dayLabel}
        meetingId={meeting?.id ?? null}
        savedAt={meeting?.recorded_at ?? null}
        scouts={scouts.map((s) => ({ id: s.id, label: `${s.first_name} ${s.last_name.slice(0, 1)}.` }))}
        present={present}
        presentNote={presentNote}
        adventures={adventures}
        work={(meeting?.work ?? []).map((w) => ({ adventure: w.adventure, requirements: w.requirements, skip: w.skip ?? {} }))}
      />
    </>
  );
}
