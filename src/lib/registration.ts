// Scouting America registration expiry. Families renew and pay at my.scouting.org; the pack only
// keeps the date so families get reminders and leaders can see who is due. Pure: safe in the browser.
import { daysBetween, easternDate } from "./tz";

export const RENEW_URL = "https://my.scouting.org";

/** "Expires in N days" from this many days out. */
export const EXPIRING_SOON_DAYS = 30;

/** Reminders go out this many days before the date (once each). */
export const REGISTRATION_REMINDER_DAYS = [30, 7, 0];

export type RegState = "current" | "soon" | "expired" | "unknown";

export interface RegStatus {
  state: RegState;
  days: number | null;
  label: string;
}

/** Where a registration stands today (Eastern time). */
export function regStatus(expires: string | null | undefined, today = easternDate(Date.now())): RegStatus {
  if (!expires) return { state: "unknown", days: null, label: "Unknown" };
  const days = daysBetween(today, expires);
  if (days < 0) return { state: "expired", days, label: "Expired" };
  if (days <= EXPIRING_SOON_DAYS) {
    return { state: "soon", days, label: days === 0 ? "Expires today" : `Expires in ${days} day${days === 1 ? "" : "s"}` };
  }
  return { state: "current", days, label: "Current" };
}

/** Should the family be nudged to renew (within 30 days, or already past)? */
export const needsRenewal = (s: RegStatus) => s.state === "soon" || s.state === "expired";

export const REG_STYLE: Record<RegState, string> = {
  current: "bg-mint text-pine",
  soon: "bg-gold-50 text-gold-800",
  expired: "bg-danger-50 text-danger",
  unknown: "bg-surface text-muted",
};

/** 2026-10-31 -> "10/31/26" */
export function fmtRegDate(d: string): string {
  return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}/${d.slice(2, 4)}`;
}
