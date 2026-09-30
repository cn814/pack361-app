// All pack events are in Maryland; format in Eastern time regardless of where the server runs.
const TZ = "America/New_York";

export function fmtDay(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }).format(new Date(iso));
}

export function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function fmtMonth(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "long", year: "numeric" }).format(new Date(iso));
}

export function fmtRange(start: string, end: string | null, allDay = false) {
  if (allDay) return end && fmtDay(end) !== fmtDay(start) ? `${fmtDay(start)} – ${fmtDay(end)}` : `${fmtDay(start)} · all day`;
  if (!end) return `${fmtDay(start)} · ${fmtTime(start)}`;
  const sameDay = fmtDay(start) === fmtDay(end);
  return sameDay ? `${fmtDay(start)} · ${fmtTime(start)}–${fmtTime(end)}` : `${fmtDay(start)} – ${fmtDay(end)}`;
}

export function daysUntil(iso: string) {
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (d <= 0) return "Today";
  if (d === 1) return "Tomorrow";
  return `In ${d} days`;
}

export function mapsLink(q: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d ago`;
  return fmtDay(iso);
}

/** True when a YYYY-MM-DD date falls within the next `days` days (or is already past). */
export function dueWithin(dateStr: string | null, days: number) {
  if (!dateStr) return false;
  return new Date(dateStr + "T12:00:00").getTime() - Date.now() < days * 86400000;
}

/** Has this moment already passed? */
export function isPast(iso: string) {
  return new Date(iso).getTime() <= Date.now();
}
