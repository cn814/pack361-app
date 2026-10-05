// When a meeting counts as "on" (the meeting bar and the Leaders tab). Shared with the browser.

/** On now: from 45 minutes before it starts until 30 minutes after it ends (or 2 hours in). */
export function meetingIsOn(m: { starts_at: string; ends_at: string | null }, now = Date.now()): boolean {
  const start = Date.parse(m.starts_at);
  const end = m.ends_at ? Date.parse(m.ends_at) : start + 90 * 60_000;
  return now >= start - 45 * 60_000 && now <= end + 30 * 60_000;
}
