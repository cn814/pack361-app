import "server-only";
import { createClient } from "./supabase/server";
import { getCatalog, getMyDenIds, getRecords, reviewsWholePack } from "./advancement-data";
import { rankProgress } from "./advancement";
import type { AdventureOption } from "@/components/MeetingForm";
import type { Adult, DenRank } from "./types";

export interface DenMeeting {
  id: string;
  den_id: string;
  meets_on: string;
  title: string;
  rank: DenRank | null;
  adventure: string | null;
  requirements: string[];
  location: string | null;
  address: string | null;
  start_time: string | null;
  end_time: string | null;
  family_note: string | null;
  recorded_at: string | null;
  attendance?: { scout_id: string }[];
}

const COLS =
  "id, den_id, meets_on, title, rank, adventure, requirements, location, address, start_time, end_time, family_note, recorded_at";

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
