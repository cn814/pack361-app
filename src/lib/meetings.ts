import "server-only";
import { createClient } from "./supabase/server";
import { getCatalog, getMyDenIds, getRecords, reviewsWholePack } from "./advancement-data";
import { getMyScouts, requireMember } from "./data";
import { rankProgress } from "./advancement";
import { easternToIso } from "./calendar";
import type { AdventureOption } from "@/components/MeetingForm";
import type { Adult, DenRank } from "./types";

/** One adventure a meeting covered. skip: requirements a scout didn't finish ({scoutId: ["2"]}). */
export interface MeetingWork {
  adventure: string;
  requirements: string[];
  skip?: Record<string, string[]>;
}

export interface DenMeeting {
  id: string;
  den_id: string;
  meets_on: string;
  title: string;
  rank: DenRank | null;
  adventure: string | null;
  requirements: string[];
  /** Every adventure covered (adventure / requirements mirror the first one). */
  work: MeetingWork[];
  location: string | null;
  address: string | null;
  start_time: string | null;
  end_time: string | null;
  family_note: string | null;
  recorded_at: string | null;
  attendance?: { scout_id: string }[];
}

const COLS =
  "id, den_id, meets_on, title, rank, adventure, requirements, work, location, address, start_time, end_time, family_note, recorded_at";

/** Can this adult plan meetings for the den? (Mirrors private.leads_den.) */
export async function leadsDen(me: Adult, denId: string): Promise<boolean> {
  return reviewsWholePack(me) || (await getMyDenIds()).includes(denId);
}

export async function getMeetings(denId: string): Promise<DenMeeting[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("den_meetings")
    .select(`${COLS}, attendance:den_meeting_attendance(scout_id)`)
    .eq("den_id", denId)
    .order("meets_on", { ascending: false })
    .limit(60);
  return (data ?? []) as DenMeeting[];
}

export async function getMeeting(id: string): Promise<DenMeeting | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("den_meetings")
    .select(`${COLS}, attendance:den_meeting_attendance(scout_id)`)
    .eq("id", id)
    .maybeSingle();
  return (data as DenMeeting | null) ?? null;
}

/** The den's meeting on this day, if there is one (the first, if somehow there are two). */
export async function getMeetingOn(denId: string, day: string): Promise<DenMeeting | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("den_meetings")
    .select(`${COLS}, attendance:den_meeting_attendance(scout_id)`)
    .eq("den_id", denId)
    .eq("meets_on", day)
    .order("created_at")
    .limit(1);
  return ((data ?? [])[0] as DenMeeting | undefined) ?? null;
}

/** Adventure names a meeting covers, for display. */
export function meetingAdventures(m: Pick<DenMeeting, "work" | "adventure">): string[] {
  const names = (m.work ?? []).map((w) => w.adventure).filter(Boolean);
  return names.length ? names : m.adventure ? [m.adventure] : [];
}

type DenMeetingEvent = { id: string; den_id: string | null; ranks: DenRank[] | null };

/** Every "Den Meeting" calendar event on this day. */
async function denMeetingEventsForDay(day: string): Promise<DenMeetingEvent[]> {
  const supabase = await createClient();
  const next = new Date(Date.parse(day + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("events")
    .select("id, den_id, ranks")
    .eq("category", "Den Meeting")
    .is("archived_at", null)
    .gte("starts_at", easternToIso(day, "00:00"))
    .lt("starts_at", easternToIso(next, "00:00"));
  return (data ?? []) as DenMeetingEvent[];
}

/** Does the event include this den (its own, its rank's, or pack-wide)? */
function includesDen(e: DenMeetingEvent, denId: string, rank: DenRank): boolean {
  return e.den_id === denId || (!e.den_id && (!e.ranks?.length || e.ranks.includes(rank)));
}

/** "Den Meeting" calendar events on this day that include this den. */
async function denMeetingEventsOn(denId: string, rank: DenRank, day: string): Promise<string[]> {
  return (await denMeetingEventsForDay(day)).filter((e) => includesDen(e, denId, rank)).map((e) => e.id);
}

/**
 * Who said they're coming: per-scout answers on the den meeting, plus family "Going" answers on a
 * "Den Meeting" calendar event that day (for that family's scouts in this den). A scout's own
 * answer wins over the family's.
 */
export async function goingScouts(
  denId: string,
  rank: DenRank,
  day: string,
  meetingId: string | null,
  scouts: { id: string; family_id: string | null }[],
): Promise<{ going: string[]; answers: number }> {
  const supabase = await createClient();
  const eventIds = await denMeetingEventsOn(denId, rank, day);
  const [{ data: mine }, { data: fam }] = await Promise.all([
    meetingId
      ? supabase.from("den_meeting_rsvps").select("scout_id, going").eq("meeting_id", meetingId)
      : Promise.resolve({ data: [] as { scout_id: string; going: boolean }[] }),
    eventIds.length
      ? supabase.from("event_rsvps").select("family_id, status").in("event_id", eventIds).not("family_id", "is", null)
      : Promise.resolve({ data: [] as { family_id: string; status: string }[] }),
  ]);
  const answer = new Map<string, boolean>();
  for (const r of (fam ?? []) as { family_id: string; status: string }[]) {
    for (const s of scouts) if (s.family_id === r.family_id && r.status !== "maybe") answer.set(s.id, r.status === "yes");
  }
  for (const r of (mine ?? []) as { scout_id: string; going: boolean }[]) answer.set(r.scout_id, r.going);
  const inDen = new Set(scouts.map((s) => s.id));
  const answered = [...answer.keys()].filter((id) => inDen.has(id));
  return { going: answered.filter((id) => answer.get(id)), answers: answered.length };
}

/** The family's scouts in this meeting's den, with their answer so far (RLS: only their own). */
export async function myMeetingRsvps(
  meeting: { id: string; den_id: string },
  myScouts: { id: string; first_name: string; den?: { id: string } | null }[],
): Promise<{ id: string; first_name: string; going: boolean | null }[]> {
  const inDen = myScouts.filter((s) => s.den?.id === meeting.den_id);
  if (!inDen.length) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("den_meeting_rsvps")
    .select("scout_id, going")
    .eq("meeting_id", meeting.id)
    .in("scout_id", inDen.map((s) => s.id));
  const ans = new Map(((data ?? []) as { scout_id: string; going: boolean }[]).map((r) => [r.scout_id, r.going]));
  return inDen.map((s) => ({ id: s.id, first_name: s.first_name, going: ans.get(s.id) ?? null }));
}

/**
 * The dens this adult runs meetings for, with whether there's a meeting today (planned in the app
 * or a "Den Meeting" on the calendar), for the Leaders tab and the meeting bar: the dens they're
 * listed as a leader of, plus, for pack leadership (who can record any den), their own scouts' dens.
 */
export async function myDenMeetingButtons(): Promise<{ denId: string; name: string; rank: DenRank; today: boolean; saved: boolean }[]> {
  const me = await requireMember();
  const [led, mine] = await Promise.all([getMyDenIds(), reviewsWholePack(me) ? getMyScouts() : Promise.resolve([])]);
  const denIds = [...new Set([...led, ...mine.map((s) => s.den?.id).filter((x): x is string => Boolean(x))])];
  if (!denIds.length) return [];
  const supabase = await createClient();
  const day = todayEastern();
  const [{ data: dens }, { data: meetings }, events] = await Promise.all([
    supabase.from("dens").select("id, name, rank").in("id", denIds).order("name"),
    supabase.from("den_meetings").select("den_id, recorded_at").in("den_id", denIds).eq("meets_on", day),
    denMeetingEventsForDay(day),
  ]);
  return ((dens ?? []) as { id: string; name: string; rank: DenRank }[]).map((d) => {
    const m = ((meetings ?? []) as { den_id: string; recorded_at: string | null }[]).filter((x) => x.den_id === d.id);
    const today = m.length > 0 || events.some((e) => includesDen(e, d.id, d.rank));
    return { denId: d.id, name: d.name, rank: d.rank, today, saved: m.some((x) => x.recorded_at) };
  });
}

/** Upcoming meetings for these dens (families see their scouts' dens). */
export async function getUpcomingMeetings(denIds: string[], limit = 3): Promise<DenMeeting[]> {
  if (!denIds.length) return [];
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const { data } = await supabase
    .from("den_meetings")
    .select(COLS)
    .in("den_id", denIds)
    .gte("meets_on", today)
    .order("meets_on")
    .limit(limit);
  return (data ?? []) as DenMeeting[];
}

export function todayEastern(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

export function fmtMeetingDate(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Adventures for the den's rank, with how many scouts still need each one. */
export async function denAdventures(denId: string, rank: DenRank): Promise<AdventureOption[]> {
  const supabase = await createClient();
  const [{ data: scouts }, catalog] = await Promise.all([
    supabase.from("scouts").select("id").eq("den_id", denId).eq("is_active", true),
    getCatalog(),
  ]);
  const ids = (scouts ?? []).map((s) => s.id as string);
  const records = await getRecords(ids);
  const progress = ids.map((id) => rankProgress(rank, records.filter((r) => r.scout_id === id), catalog));
  return catalog
    .filter((a) => a.rank === rank && !a.special)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((a) => ({
      name: a.name,
      req_count: a.req_count,
      required: a.required,
      url: a.info_url ?? null,
      missing: progress.filter((p) => ![...p.required, ...p.electives].find((x) => x.name === a.name)?.done).length,
    }));
}


/** "6:30 PM" from "18:30:00". */
export function fmtClock(t: string | null): string | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function fmtMeetingTime(m: { start_time: string | null; end_time: string | null }): string | null {
  const a = fmtClock(m.start_time);
  const b = fmtClock(m.end_time);
  return a ? (b ? `${a}–${b}` : a) : null;
}
