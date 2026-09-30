// Leader training courses the pack tracks (Scouting America requirements for Cub Scout leaders).
// Pure data and date helpers: safe to import from server or client code.

import { daysBetween, easternDate } from "./tz";

export type CourseKey = "ypt" | "position" | "hazardous_weather" | "baloo" | "safe_swim" | "safety_afloat";

export interface Course {
  key: CourseKey;
  label: string;
  short: string;
  /** Years a completion stays current; null = doesn't expire. */
  years: number | null;
  /** Who needs it, in plain words. */
  who: string;
  required: boolean;
}

export const COURSES: Course[] = [
  { key: "ypt", label: "Safeguarding Youth (YPT)", short: "YPT", years: 2, who: "Every registered adult leader", required: true },
  { key: "position", label: "Position-specific training", short: "Position", years: null, who: "Den leaders, Cubmaster, committee", required: true },
  { key: "hazardous_weather", label: "Hazardous Weather", short: "Weather", years: 2, who: "At least one adult on every outing", required: false },
  { key: "baloo", label: "BALOO (pack overnighters)", short: "BALOO", years: null, who: "At least one adult at a pack campout", required: false },
  { key: "safe_swim", label: "Safe Swim Defense", short: "Swim", years: 2, who: "Outings with swimming", required: false },
  { key: "safety_afloat", label: "Safety Afloat", short: "Afloat", years: 2, who: "Outings with boating", required: false },
];

export const COURSE_BY_KEY = Object.fromEntries(COURSES.map((c) => [c.key, c])) as Record<CourseKey, Course>;

export interface TrainingRow {
  adult_id: string;
  course: CourseKey;
  completed_on: string | null;
  expires_on: string | null;
}

export type TrainingState = "current" | "expiring" | "expired" | "missing";

export function daysLeft(expires: string | null): number | null {
  if (!expires) return null;
  return daysBetween(easternDate(Date.now()), expires);
}

export function trainingState(row: TrainingRow | undefined): TrainingState {
  if (!row || (!row.completed_on && !row.expires_on)) return "missing";
  const d = daysLeft(row.expires_on);
  if (d === null) return "current";
  if (d < 0) return "expired";
  if (d <= 60) return "expiring";
  return "current";
}

/** Default expiry for a completion date. */
export function defaultExpiry(course: CourseKey, completedOn: string): string | null {
  const years = COURSE_BY_KEY[course]?.years;
  if (!years || !/^\d{4}-\d{2}-\d{2}$/.test(completedOn)) return null;
  const [y, m, d] = completedOn.split("-").map(Number);
  return `${y + years}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Reminder thresholds, in days before expiry. */
export const REMINDER_DAYS = [60, 30, 7, 0];
