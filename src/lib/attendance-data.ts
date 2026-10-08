import "server-only";
import { createClient } from "./supabase/server";
import { denOrder, scoutLabel, type AttendanceGroup, type AttendanceTotals } from "./attendance";
import { RANK_LABEL } from "./advancement";
import { getMyDenIds, reviewsWholePack } from "./advancement-data";
import { seasonOf, seasonRange } from "./finance";
import { easternDate } from "./tz";
import type { Adult, DenRank, PackEvent } from "./types";

export interface AttendanceScout {
  id: string;
  first_name: string;
  last_name: string;
  family_id: string | null;
  is_active: boolean;
  den: { id: string; rank: DenRank; name: string } | null;
}

/** Active scouts (and anyone already on the list), grouped by den in rank order. */
function groupScouts(scouts: AttendanceScout[], focusDen: (s: AttendanceScout) => boolean): AttendanceGroup[] {
  const groups = new Map<string, AttendanceGroup>();
  const order = new Map<string, number>();
  for (const s of scouts) {
    const key = s.den?.id ?? "none";
    let g = groups.get(key);
    if (!g) {
      g = { key, name: s.den ? s.den.name || RANK_LABEL[s.den.rank] : "No den yet", focus: focusDen(s), scouts: [] };
      groups.set(key, g);
      order.set(key, denOrder(s.den?.rank));
    }
    g.scouts.push({ id: s.id, label: scoutLabel(s) });
  }
  return [...groups.values()].sort(
    (a, b) => Number(b.focus) - Number(a.focus) || order.get(a.key)! - order.get(b.key)! || a.name.localeCompare(b.name),
  );
}

/**
 * What the "Take attendance" card needs: scouts by den, who's checked (the saved list, or else
 * scouts from families that said yes), and whether attendance was taken already.
 */
export async function getEventAttendance(
  e: PackEvent,
  me: Adult,
): Promise<{
  groups: AttendanceGroup[];
  present: string[];
  taken: boolean;
  fromRsvps: number;
  hasFocus: boolean;
  /** A den leader's own dens' names: the list is just those dens (null = the whole pack). */
  ownDens: string[] | null;
}> {
  const supabase = await createClient();
  // Den leaders see (and save) just their own dens; key leaders, and leaders without a den, the pack.
  const myDens = reviewsWholePack(me) ? [] : await getMyDenIds();
  const [{ data: scoutRows }, { data: saved }, { data: rsvps }] = await Promise.all([
    supabase
      .from("scouts")
      .select("id, first_name, last_name, family_id, is_active, den:dens(id, rank, name)")
      .eq("is_active", true)
      .order("first_name")
      .order("last_name"),
    supabase
      .from("event_attendance")
      .select("scout:scouts(id, first_name, last_name, family_id, is_active, den:dens(id, rank, name))")
      .eq("event_id", e.id),
    supabase.from("event_rsvps").select("family_id").eq("event_id", e.id).eq("status", "yes").eq("waitlisted", false).not("family_id", "is", null),
  ]);
  const scouts = (scoutRows ?? []) as unknown as AttendanceScout[];
  const savedScouts = ((saved ?? []) as unknown as { scout: AttendanceScout | null }[]).map((r) => r.scout).filter(Boolean) as AttendanceScout[];
  // Someone already on the list who has since left the pack still shows, so a re-save keeps them.
  const ids = new Set(scouts.map((s) => s.id));
  for (const s of savedScouts) if (!ids.has(s.id)) scouts.push(s);
  const mine = (s: AttendanceScout) => !myDens.length || (s.den ? myDens.includes(s.den.id) : false);
  const inScope = scouts.filter(mine);
  const savedInScope = savedScouts.filter(mine);

  const ranks = e.ranks ?? [];
  const hasFocus = Boolean(e.den_id) || ranks.length > 0;
  const focusDen = (s: AttendanceScout) =>
    hasFocus && Boolean(s.den) && (e.den_id ? s.den!.id === e.den_id : ranks.includes(s.den!.rank));

  // A den leader's den counts as taken once someone saved a scout in it.
  const taken = myDens.length ? savedInScope.length > 0 : Boolean(e.attendance_taken_at) || savedScouts.length > 0;
  let present: string[];
  let fromRsvps = 0;
  if (taken) {
    present = savedInScope.map((s) => s.id);
  } else {
    // Families that said yes: check their scouts (in the event's dens, if it's for certain dens).
    const yes = new Set(((rsvps ?? []) as { family_id: string }[]).map((r) => r.family_id));
    const fam = inScope.filter((s) => s.is_active && s.family_id && yes.has(s.family_id));
    const inFocus = fam.filter(focusDen);
    present = (hasFocus && inFocus.length ? inFocus : fam).map((s) => s.id);
    fromRsvps = new Set(fam.map((s) => s.family_id)).size;
  }
  const ownDens = myDens.length
    ? [...new Set(inScope.map((s) => (s.den ? s.den.name || RANK_LABEL[s.den.rank] : "")).filter(Boolean))]
    : null;
  return { groups: groupScouts(inScope, focusDen), present, taken, fromRsvps, hasFocus: hasFocus && !myDens.length, ownDens };
}

/** Totals per scout for a date range (attendance_summary; RLS decides what counts). */
export async function getAttendanceTotals(from: string, to: string, scoutId?: string): Promise<Map<string, AttendanceTotals>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("attendance_summary", {
    p_from: from,
    p_to: to,
    ...(scoutId ? { p_scout_id: scoutId } : {}),
  });
  return new Map(((data ?? []) as AttendanceTotals[]).map((r) => [r.scout_id, r]));
}

export interface AttendanceReportRow {
  id: string;
  name: string;
  active: boolean;
  /** null when the viewer can't see this den's meetings (den leaders see their own dens). */
  denMeetings: number | null;
  denMeetingsHeld: number | null;
  events: number;
  nights: number;
  nightsAll: number;
}

export interface AttendanceReport {
  season: string;
  from: string;
  to: string;
  /** In rank order (Lion first); `order` is the den's place in it. */
  dens: { key: string; name: string; order: number; rows: AttendanceReportRow[] }[];
  /** Den leaders only see den meetings for their own dens. */
  limitedDens: boolean;
}

/** Seasons to pick from: this one back to the first event or den meeting with attendance. */
export async function getAttendanceSeasons(current: string): Promise<string[]> {
  const supabase = await createClient();
  const [{ data: ev }, { data: dm }] = await Promise.all([
    supabase.from("events").select("starts_at").not("attendance_taken_at", "is", null).order("starts_at").limit(1),
    supabase.from("den_meetings").select("meets_on").not("recorded_at", "is", null).order("meets_on").limit(1),
  ]);
  const firstEvent = (ev ?? [])[0]?.starts_at as string | undefined;
  const dates = [firstEvent ? easternDate(firstEvent) : null, (dm ?? [])[0]?.meets_on as string | undefined].filter(Boolean) as string[];
  const first = dates.length ? seasonOf(dates.sort()[0]) : current;
  const startYear = Math.max(Math.min(Number(first.slice(0, 4)), Number(current.slice(0, 4))), Number(current.slice(0, 4)) - 10);
  const out: string[] = [];
  for (let y = Number(current.slice(0, 4)); y >= startYear; y--) out.push(`${y}-${String((y + 1) % 100).padStart(2, "0")}`);
  return out;
}

/** Leaders: each scout's den meetings, pack events and camping nights for a season, by den. */
export async function buildAttendanceReport(me: Adult, season: string): Promise<AttendanceReport | null> {
  const range = seasonRange(season);
  if (!range) return null;
  const supabase = await createClient();
  const whole = reviewsWholePack(me);
  const [{ data: scoutRows }, totals, myDens] = await Promise.all([
    supabase
      .from("scouts")
      .select("id, first_name, last_name, family_id, is_active, den:dens(id, rank, name)")
      .order("last_name")
      .order("first_name"),
    getAttendanceTotals(range.from, range.to),
    whole ? Promise.resolve([] as string[]) : getMyDenIds(),
  ]);
  const scouts = (scoutRows ?? []) as unknown as AttendanceScout[];
  const dens = new Map<string, { key: string; name: string; order: number; rows: AttendanceReportRow[] }>();
  for (const s of scouts) {
    const t = totals.get(s.id);
    // Scouts who have left show only if they came to something that season.
    if (!s.is_active && !(t && (t.den_meetings || t.events))) continue;
    const seesMeetings = whole || (s.den ? myDens.includes(s.den.id) : false);
    const key = s.den?.id ?? "none";
    let d = dens.get(key);
    if (!d) {
      d = { key, name: s.den ? s.den.name || RANK_LABEL[s.den.rank] : "No den", order: denOrder(s.den?.rank), rows: [] };
      dens.set(key, d);
    }
    d.rows.push({
      id: s.id,
      name: `${s.first_name} ${s.last_name}`,
      active: s.is_active,
      denMeetings: seesMeetings ? (t?.den_meetings ?? 0) : null,
      denMeetingsHeld: seesMeetings ? (t?.den_meetings_held ?? 0) : null,
      events: t?.events ?? 0,
      nights: t?.nights ?? 0,
      nightsAll: t?.nights_all ?? 0,
    });
  }
  return {
    season,
    from: range.from,
    to: range.to,
    dens: [...dens.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    limitedDens: !whole,
  };
}
