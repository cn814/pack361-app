// All pack events are in Maryland; format in Eastern time regardless of where the server runs.
import { TZ, daysBetween, easternDate } from "./tz";

// Built once: creating a formatter is slow, and the calendar formats hundreds of dates.
const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const monthFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "long", year: "numeric" });

export function fmtDay(iso: string) {
  return dayFmt.format(new Date(iso));
}

export function fmtTime(iso: string) {
  return timeFmt.format(new Date(iso));
}

export function fmtMonth(iso: string) {
  return monthFmt.format(new Date(iso));
}

export function fmtRange(start: string, end: string | null, allDay = false) {
  if (allDay) return end && fmtDay(end) !== fmtDay(start) ? `${fmtDay(start)} – ${fmtDay(end)}` : `${fmtDay(start)} · all day`;
  if (!end) return `${fmtDay(start)} · ${fmtTime(start)}`;
  const sameDay = fmtDay(start) === fmtDay(end);
  return sameDay ? `${fmtDay(start)} · ${fmtTime(start)}–${fmtTime(end)}` : `${fmtDay(start)} – ${fmtDay(end)}`;
}

/** An event's dates, with no time when it's all day or has no real start time (midnight). */
export function fmtEventDates(e: { starts_at: string; ends_at: string | null; all_day?: boolean | null }) {
  const noTime = Boolean(e.all_day) || fmtTime(e.starts_at) === "12:00 AM";
  if (noTime && (!e.ends_at || fmtDay(e.ends_at) === fmtDay(e.starts_at))) return fmtDay(e.starts_at);
  return fmtRange(e.starts_at, e.ends_at, noTime);
}

/** "Today", "Tomorrow", "In 5 days" by calendar day in Eastern time; "Happening now" mid-event. */
export function daysUntil(iso: string, endIso?: string | null) {
  const today = easternDate(Date.now());
  const d = daysBetween(today, easternDate(iso));
  if (d < 0) return endIso && daysBetween(today, easternDate(endIso)) >= 0 ? "Happening now" : "Today";
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return `In ${d} days`;
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d ago`;
  return fmtDay(iso);
}

/** Has this moment already passed? */
export function isPast(iso: string) {
  return new Date(iso).getTime() <= Date.now();
}

/**
 * Is the event over? An all-day event runs to the end of its last Eastern day (its times are
 * stored as midnight), anything else to its end time, or its start when it has none.
 */
export function eventOver(e: { starts_at: string; ends_at: string | null; all_day?: boolean | null }) {
  if (e.all_day) return easternDate(e.ends_at ?? e.starts_at) < easternDate(Date.now());
  return isPast(e.ends_at ?? e.starts_at);
}
