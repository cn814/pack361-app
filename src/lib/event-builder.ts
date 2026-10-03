// Building an event in the app: repeating dates, and the packing list's display order.
// Pure: safe on the server and in the browser.
import { addDays, daysBetween } from "./tz";

export type Repeat = "never" | "weekly" | "biweekly" | "monthly";
export const REPEATS: Repeat[] = ["never", "weekly", "biweekly", "monthly"];
/** The most events one "Repeats" can add. */
export const MAX_REPEATS = 60;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDINALS = ["1st", "2nd", "3rd", "4th"];

const ymd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** Which weekday of its month a date is: 1-4, or 5 for "the last one" (a 5th Friday, say). */
function nthOfMonth(date: string): number {
  const day = Number(date.slice(8, 10));
  return Math.ceil(day / 7);
}

/** "2nd Tuesday" or "last Friday": how a monthly repeat from `date` is described. */
export function monthlyLabel(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "same weekday";
  const n = nthOfMonth(date);
  return `${n >= 5 ? "last" : ORDINALS[n - 1]} ${WEEKDAYS[weekday(date)]}`;
}

/** The date of the `n`th (5 = last) `wd` weekday in a month. */
function nthWeekday(y: number, m: number, wd: number, n: number): string {
  if (n >= 5) {
    const last = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last day of this one
    const back = (last.getUTCDay() - wd + 7) % 7;
    return ymd(y, m, last.getUTCDate() - back);
  }
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return ymd(y, m, 1 + ((wd - first + 7) % 7) + (n - 1) * 7);
}

/**
 * Start dates for a repeating event, from `start` through `until` (YYYY-MM-DD, both included).
 * Monthly keeps the same weekday of the month (the 2nd Tuesday; a 5th one becomes "the last").
 * Stops one past `max`, so the caller can tell the person it's too many.
 */
export function repeatDates(start: string, repeat: Repeat, until: string, max = MAX_REPEATS): string[] {
  if (repeat === "never" || until < start) return [start];
  const out: string[] = [];
  if (repeat === "monthly") {
    const wd = weekday(start);
    const n = nthOfMonth(start);
    let y = Number(start.slice(0, 4));
    let m = Number(start.slice(5, 7));
    for (let d = start; d <= until && out.length <= max;) {
      out.push(d);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
      d = nthWeekday(y, m, wd, n);
    }
    return out;
  }
  const step = repeat === "weekly" ? 7 : 14;
  for (let d = start; d <= until && out.length <= max; d = addDays(d, step)) out.push(d);
  return out;
}

/** Moves an optional YYYY-MM-DD date by the days between two dates (a deadline that follows its event). */
export function shiftDate(date: string | null, from: string, to: string): string | null {
  return date ? addDays(date, daysBetween(from, to)) : null;
}

/**
 * The packing list in the order families see it: categories in the order they first appear,
 * then the items in each. Moving things around renumbers the list in this order.
 */
export function packingGroups<T extends { category: string; sort_order: number }>(items: T[]): [string, T[]][] {
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);
  const m = new Map<string, T[]>();
  for (const i of sorted) m.set(i.category, [...(m.get(i.category) ?? []), i]);
  return [...m.entries()];
}

/** Swap an element with its neighbor (-1 = earlier, 1 = later). Returns the same array if it can't move. */
export function moveInList<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir;
  if (index < 0 || index >= list.length || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

/** Bullet items typed one per line: trimmed, blanks and repeats dropped. */
export function linesToItems(text: string, maxLen = 500): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw
      .replace(/^\s*[-*•]\s*/, "")
      .trim()
      .slice(0, maxLen);
    if (!line || seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}
