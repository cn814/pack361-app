// Minimal iCalendar (RFC 5545) writer for the pack calendar feed.
import { addDays, easternDate } from "./tz";

export interface IcsEvent {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  description: string | null;
  url: string | null;
  allDay?: boolean;
  /** Leaders-only event: the title is marked "[Leaders] " and the description left out. */
  leadersOnly?: boolean;
}

// Control characters other than tab and line breaks (line breaks are escaped first).
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

/**
 * TEXT value escaping (RFC 5545 3.3.11). Every line break (CRLF, a lone CR or a lone LF) becomes
 * "\n", so a value can never start a new property line (e.g. "Title\rBEGIN:VALARM").
 */
export const esc = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(CONTROL, "");
const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Eastern-time calendar date as YYYYMMDD (all-day events). */
const ymd = (iso: string) => easternDate(iso).replace(/-/g, "");
/** The Eastern calendar day after `iso`, as YYYYMMDD (exclusive DTEND). Calendar math, not +24h, so DST days work. */
const nextYmd = (iso: string) => addDays(easternDate(iso), 1).replace(/-/g, "");

/** Fold lines longer than 75 octets (continuation lines start with a space). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = ch;
    } else cur += ch;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

export function buildIcs(name: string, events: IcsEvent[], now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pack 361//Pack App//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`,
    "X-WR-TIMEZONE:America/New_York",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const e of events) {
    const end = e.ends_at ?? new Date(new Date(e.starts_at).getTime() + 60 * 60 * 1000).toISOString();
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@pack361-app`,
      `DTSTAMP:${stamp(now.toISOString())}`,
      ...(e.allDay
        ? [`DTSTART;VALUE=DATE:${ymd(e.starts_at)}`, `DTEND;VALUE=DATE:${nextYmd(e.ends_at ?? e.starts_at)}`]
        : [`DTSTART:${stamp(e.starts_at)}`, `DTEND:${stamp(end)}`]),
      `SUMMARY:${esc(e.leadersOnly ? `[Leaders] ${e.title}` : e.title)}`,
    );
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.description && !e.leadersOnly) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.url) lines.push(`URL:${e.url.replace(/[\r\n]/g, "").replace(CONTROL, "")}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
