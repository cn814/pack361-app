// Attendance and camping nights. Pure: safe on the server and in the browser.
// Mirrors private.event_nights() in the 20261005000100_attendance migration.
import { daysBetween, easternDate } from "./tz";
import { RANKS } from "./advancement";
import type { DenRank } from "./types";

/** Nights between two Eastern dates (YYYY-MM-DD), never below 0. */
export function nightsBetween(startDate: string, endDate: string | null | undefined): number {
  if (!endDate) return 0;
  return Math.max(0, daysBetween(startDate, endDate));
}

/** Nights the dates say: Eastern days from start to end (Fri to Sun = 2), 0 for a one-day event. */
export function autoCampingNights(e: { starts_at: string; ends_at: string | null }): number {
  return e.ends_at ? nightsBetween(easternDate(e.starts_at), easternDate(e.ends_at)) : 0;
}

/** Nights an event counts for: the leader's number, or what the dates say. */
export function campingNights(e: { starts_at: string; ends_at: string | null; camping_nights?: number | null }): number {
  return e.camping_nights ?? autoCampingNights(e);
}

/** Campouts and events that run over more than one day ask for camping nights on the form. */
export function asksForNights(category: string, startDate: string, endDate: string | null | undefined): boolean {
  return category === "Campout" || nightsBetween(startDate, endDate) > 0;
}

/** Den order on attendance screens: Lion, Tiger, Wolf, Bear, Webelos, Arrow of Light, then no den. */
export function denOrder(rank: DenRank | null | undefined): number {
  const i = rank ? RANKS.indexOf(rank) : -1;
  return i < 0 ? RANKS.length : i;
}

/** "Pat S." for attendance lists. */
export function scoutLabel(s: { first_name: string; last_name: string }): string {
  return `${s.first_name} ${s.last_name.slice(0, 1)}${s.last_name ? "." : ""}`.trim();
}

/** One den's scouts on the "Take attendance" card. */
export interface AttendanceGroup {
  key: string;
  name: string;
  /** The event is for this den (den_id or ranks). */
  focus: boolean;
  scouts: { id: string; label: string }[];
}

/** Per scout totals from attendance_summary(). */
export interface AttendanceTotals {
  scout_id: string;
  den_meetings: number;
  den_meetings_held: number;
  events: number;
  nights: number;
  nights_all: number;
}

/** "2 nights", "1 night". */
export const nightsLabel = (n: number) => `${n} night${n === 1 ? "" : "s"}`;
