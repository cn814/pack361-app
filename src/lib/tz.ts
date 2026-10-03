// Eastern time helpers. Pure: safe on the server and in the browser.
export const TZ = "America/New_York";

const offsetFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" });
const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** Eastern offset from UTC in hours at an instant (-4 in summer, -5 in winter). */
function offsetAt(ms: number): number {
  const v = offsetFmt.formatToParts(new Date(ms)).find((p) => p.type === "timeZoneName")?.value ?? "GMT-5";
  return Number(v.replace("GMT", "") || 0);
}

/**
 * A wall-clock time in Eastern time as a UTC ISO string. Checks the offset at the result
 * rather than at noon, so midnight on the spring-forward Sunday stays on that Sunday.
 */
export function easternWallToIso(y: number, mo: number, d: number, h = 0, mi = 0): string {
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let ms = wall - offsetAt(Date.UTC(y, mo - 1, d, 12)) * 3600000;
  const fixed = wall - offsetAt(ms) * 3600000;
  if (fixed !== ms) ms = fixed;
  return new Date(ms).toISOString();
}

/** YYYY-MM-DD in Eastern time. */
export function easternDate(iso: string | number | Date): string {
  return dateFmt.format(new Date(iso));
}

/** Eastern wall-clock parts of an instant. */
export function easternParts(iso: string | number | Date): { y: number; mo: number; d: number; h: number; mi: number } {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
}

/** Midnight at the start of today (or `date`, YYYY-MM-DD) in Eastern time, as ISO. */
export function startOfEasternDay(date?: string): string {
  const s = date ?? easternDate(Date.now());
  return easternWallToIso(+s.slice(0, 4), +s.slice(5, 7), +s.slice(8, 10));
}

/** Whole calendar days from today to `date` (both YYYY-MM-DD, Eastern). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) - Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) / 86400000);
}

/** Add `n` calendar days to a YYYY-MM-DD date (no clock math, so DST changes can't skip or repeat a day). */
export function addDays(date: string, n: number): string {
  return new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + n)).toISOString().slice(0, 10);
}
