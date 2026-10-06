// Pure helpers for the automatic reminders and family alerts (src/lib/reminders.ts and
// src/lib/family-alerts.ts): which Eastern day a reminder is due, who an event is for, and the
// wording. No Supabase or server-only imports, so they can be tested on their own.
import { addDays, daysBetween, easternDate, startOfEasternDay } from "./tz";
import type { DenRank } from "./types";

// ---------------------------------------------------------------------------
// When reminders are due (all by calendar day in Eastern time)
// ---------------------------------------------------------------------------

/** The day-before reminder goes out on the Eastern day before the event starts. */
export function dayBeforeDue(startsAt: string, today: string): boolean {
  return easternDate(startsAt) === addDays(today, 1);
}

/** The RSVP nudge goes out two Eastern days before the RSVP-by date (the last day to answer). */
export function rsvpNudgeDue(rsvpBy: string | null | undefined, today: string): boolean {
  return Boolean(rsvpBy) && rsvpBy === addDays(today, 2);
}

/**
 * The instants that bound "starts tomorrow" (Eastern): from midnight tomorrow to midnight the day
 * after. 25 hours on the night the clocks fall back, 23 when they spring forward.
 */
export function tomorrowWindow(today: string): { from: string; to: string } {
  return { from: startOfEasternDay(addDays(today, 1)), to: startOfEasternDay(addDays(today, 2)) };
}

// ---------------------------------------------------------------------------
// Who an event is for
// ---------------------------------------------------------------------------
export interface AudienceEvent {
  den_id: string | null;
  ranks?: DenRank[] | null;
  /** Only for these scouts. */
  only_scouts?: string[] | null;
  leaders_only?: boolean | null;
}

export interface AudienceScout {
  id: string;
  family_id: string;
  den_id: string | null;
  rank: DenRank | null;
}

/**
 * Families an event is for: pack-wide = every family with an active scout; a den's event = the
 * families with an active scout in that den; a rank event = families with an active scout of one
 * of those ranks; an event only for some scouts = those scouts' families. Leader-only events are for no family. `scouts` must be active scouts only.
 */
export function familiesFor(e: AudienceEvent, scouts: AudienceScout[]): string[] {
  if (e.leaders_only) return [];
  if (e.only_scouts?.length) return [...new Set(scouts.filter((s) => e.only_scouts!.includes(s.id)).map((s) => s.family_id))];
  const ranks = e.ranks ?? [];
  const fits = (s: AudienceScout) =>
    e.den_id ? s.den_id === e.den_id : ranks.length ? s.rank !== null && ranks.includes(s.rank) : true;
  return [...new Set(scouts.filter(fits).map((s) => s.family_id))];
}

// ---------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------
const TZ = "America/New_York";
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });

/** "Sat, Oct 10" for a YYYY-MM-DD date. */
export function shortDay(date: string): string {
  return dayFmt.format(new Date(`${date}T12:00:00-05:00`));
}

/** "9:00 AM", "All day", "9:00 AM until Sun, Oct 11" or "Through Sun, Oct 11" (multi-day). */
export function startWords(e: { starts_at: string; ends_at: string | null; all_day?: boolean | null }): string {
  const startDay = easternDate(e.starts_at);
  const endDay = e.ends_at ? easternDate(e.ends_at) : startDay;
  const multi = endDay > startDay;
  if (e.all_day) return multi ? `Through ${shortDay(endDay)}` : "All day";
  return multi ? `${timeFmt.format(new Date(e.starts_at))} until ${shortDay(endDay)}` : timeFmt.format(new Date(e.starts_at));
}

/**
 * "9:00 AM · Camp Ilchester" (time and place, for a push). Lock screens show this, so it never
 * falls back to the street address: the place name, else "see the event".
 */
export function whenWhere(e: { starts_at: string; ends_at: string | null; all_day?: boolean | null; location_name?: string | null }): string {
  const place = e.location_name?.trim() || "see the event";
  return `${startWords(e)} · ${place}`;
}

/** "Wolves", "Arrow of Light"... for "Today the Wolves worked on ...". */
export const RANK_GROUP: Record<DenRank, string> = {
  lion: "Lions",
  tiger: "Tigers",
  wolf: "Wolves",
  bear: "Bears",
  webelos: "Webelos",
  aol: "Arrow of Light scouts",
};

/** "A", "A and B", "A, B and C". */
export function andList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Whole Eastern days from `date` back to `today` (0 = today; negative = in the future). */
export function daysAgo(date: string, today: string): number {
  return daysBetween(date, today);
}

/** "Today" / "Yesterday" / "On Mon, Oct 5" for a den meeting day. */
export function meetingWhen(meetsOn: string, today: string): { cap: string; low: string } {
  const d = daysBetween(meetsOn, today);
  if (d <= 0) return { cap: "Today", low: "today's" };
  if (d === 1) return { cap: "Yesterday", low: "yesterday's" };
  return { cap: `On ${shortDay(meetsOn)}`, low: `the ${shortDay(meetsOn)}` };
}

/** Keep a push body short enough for a phone's lock screen. */
export function clip(s: string, n = 230): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

// ---------------------------------------------------------------------------
// Scoutbook: what a scout newly earned
// ---------------------------------------------------------------------------
export interface EarnedRow {
  scout_id: string;
  kind: string;
  rank: DenRank | null;
  adventure: string | null;
  item: string;
  version: string;
  completed_on: string | null;
  source_type: string;
  source_name: string;
}

const earnedKey = (r: Pick<EarnedRow, "scout_id" | "source_type" | "source_name" | "version">) =>
  [r.scout_id, r.source_type, r.source_name, r.version ?? ""].join("|");

/**
 * Adventures and ranks in `incoming` that the app didn't have before the import, per scout.
 * Scouts with nothing on record before (their first import) are left out, so a first import
 * doesn't announce years of advancement; so are items finished more than `maxAgeDays` ago.
 */
export function newlyEarned(
  incoming: EarnedRow[],
  before: Pick<EarnedRow, "scout_id" | "source_type" | "source_name" | "version">[],
  scoutsWithRecords: Set<string>,
  today: string,
  maxAgeDays = 60,
): Map<string, EarnedRow[]> {
  const had = new Set(before.map(earnedKey));
  const oldest = addDays(today, -maxAgeDays);
  const out = new Map<string, EarnedRow[]>();
  const seen = new Set<string>();
  for (const r of incoming) {
    if (r.kind !== "adventure" && r.kind !== "rank") continue;
    if (!scoutsWithRecords.has(r.scout_id)) continue;
    if (!r.completed_on || r.completed_on < oldest) continue;
    const k = earnedKey(r);
    if (had.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.set(r.scout_id, [...(out.get(r.scout_id) ?? []), r]);
  }
  return out;
}

const RANK_TITLE: Record<DenRank, string> = { lion: "Lion", tiger: "Tiger", wolf: "Wolf", bear: "Bear", webelos: "Webelos", aol: "Arrow of Light" };

/** "the Wolf rank" or "Paws on the Path". */
export function earnedLabel(r: Pick<EarnedRow, "kind" | "rank" | "adventure" | "item">): string {
  if (r.kind === "rank") return r.rank ? `the ${RANK_TITLE[r.rank]} rank` : r.item.replace(/ Rank$/i, " rank");
  return r.adventure ?? r.item;
}

/** The push for one scout's new advancement: a rank first, then adventures. */
export function earnedMessage(first: string, items: Pick<EarnedRow, "kind" | "rank" | "adventure" | "item">[]): { title: string; body: string } {
  const ranks = items.filter((i) => i.kind === "rank");
  const advs = items.filter((i) => i.kind !== "rank");
  const lead = ranks[0] ?? advs[0];
  const title = items.length === 1 || ranks.length ? `${first} earned ${earnedLabel(lead)}!` : `${first} earned ${advs.length} adventures!`;
  const names = advs.map(earnedLabel);
  const body = ranks.length
    ? names.length
      ? `Also new in Scoutbook: ${andList(names)}.`
      : "Congratulations! It's now in Scoutbook."
    : items.length === 1
      ? "Congratulations! It's now in Scoutbook."
      : `${andList(names)}. Congratulations!`;
  return { title, body: clip(body) };
}
