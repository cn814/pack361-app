import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseIcs, type FeedEvent } from "./twh";
import { startOfEasternDay } from "./tz";

// Baltimore Area Council calendar (Black Pug Software's ScoutingEvent). The committee saves the
// calendar's subscription link in pack_settings.council_calendar_url. Every day (and from the
// "Check now" button) the sync copies the feed into council_events, where the committee picks
// which events go on the pack calendar (/events/council). It never deletes and never puts
// anything on the pack calendar by itself: it only
//   - adds and refreshes council_events rows, and marks the ones that left the feed (removed_at);
//   - keeps the title, time and place of pack events made from a council event in step with
//     the council, as long as nobody edited them in the app (events.source stays 'council').
// It writes with the secret-key client: committee members can't insert council_events rows,
// and not everyone who presses "Check now" can write pack_settings.

export const COUNCIL_URL_KEY = "council_calendar_url";
export const COUNCIL_STATUS_KEY = "council_last_sync";
/** The council calendar's web page, for people looking for the subscription link. */
export const COUNCIL_CALENDAR_PAGE = "https://scoutingevent.com/220";

/**
 * Some calendar sites send the web page to browsers and the calendar file to calendar apps, so
 * ask like a calendar app does.
 */
const FETCH_HEADERS = {
  Accept: "text/calendar, */*",
  "User-Agent": "Pack361-CalendarSync/1.0 (iCalendar subscription client)",
};
const MAX_HOPS = 6;
const MAX_BYTES = 5_000_000;

export const NOT_A_CALENDAR =
  "The link didn't return a calendar file (it returned a web page). In the council calendar, choose Subscribe → Outlook or Google, then copy the address that starts with webcal:// or ends in .ics, and save that here.";

/** A problem worth showing to the committee as is. */
export class FeedError extends Error {}

/** https:// form of a calendar link (webcal:// → https://), or null if it isn't a web address. */
export function normalizeFeedUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().replace(/^webcals?:\/\//i, "https://");
  if (!/^https?:\/\/\S+$/i.test(s)) return null;
  try {
    return new URL(s).toString();
  } catch {
    return null;
  }
}

const decodeAttr = (s: string) => s.replace(/&amp;/gi, "&").replace(/&#0*38;/g, "&").replace(/&quot;/gi, '"');

/** A calendar link on a web page: a webcal:// address, or a link to an .ics file. */
function calendarLinkIn(html: string, base: string): string | null {
  const webcal = html.match(/webcals?:\/\/[^\s"'<>]+/i)?.[0];
  if (webcal) return normalizeFeedUrl(decodeAttr(webcal));
  const ics = html.match(/href\s*=\s*["']([^"']+?\.ics(?:\?[^"']*)?)["']/i)?.[1];
  if (ics) {
    try {
      return normalizeFeedUrl(new URL(decodeAttr(ics), base).toString());
    } catch {
      return null;
    }
  }
  return null;
}

/** <meta http-equiv="refresh" content="0; url=..."> */
function metaRefresh(html: string, base: string): string | null {
  const tag = html.match(/<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*>/i)?.[0];
  const target = tag?.match(/url\s*=\s*['"]?([^'">\s]+)/i)?.[1];
  if (!target) return null;
  try {
    return normalizeFeedUrl(new URL(decodeAttr(target), base).toString());
  } catch {
    return null;
  }
}

export interface FetchedCalendar {
  text: string;
  /** Set when the saved link returned a web page and a calendar link on it worked instead. */
  foundUrl?: string;
}

/**
 * Download the calendar file. Follows redirects (including ones to webcal://) and simple page
 * redirects; if the link opens a web page that has a calendar link on it, tries that once.
 * Accepts the result only if it is an iCalendar file (starts with BEGIN:VCALENDAR).
 */
export async function fetchCouncilCalendar(link: string): Promise<FetchedCalendar> {
  const first = normalizeFeedUrl(link);
  if (!first) throw new FeedError("The saved council calendar link isn't a web address. It should start with webcal:// or https://.");
  let url: string = first;
  const signal = AbortSignal.timeout(20000);
  let foundUrl: string | undefined;
  let triedPageLink = false;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    let res: Response;
    try {
      res = await fetch(url, { headers: FETCH_HEADERS, redirect: "manual", cache: "no-store", signal });
    } catch (e) {
      const why = e instanceof Error && e.name === "TimeoutError" ? "it took too long to answer" : e instanceof Error ? e.message : "network error";
      throw new FeedError(`Couldn't reach the council calendar (${why}).`);
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      const target = next ? normalizeFeedUrl(new URL(next.replace(/^webcals?:\/\//i, "https://"), url).toString()) : null;
      if (!target) throw new FeedError(`The council calendar link redirected somewhere unexpected (${res.status}).`);
      url = target;
      continue;
    }
    if (!res.ok) throw new FeedError(`The council calendar answered with an error (${res.status}). Check the link.`);
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new FeedError("The council calendar file is too large.");
    const text = (await res.text()).slice(0, MAX_BYTES).replace(/^﻿/, "");
    if (text.trimStart().startsWith("BEGIN:VCALENDAR")) return { text, foundUrl };
    if (/<html|<!doctype html/i.test(text.slice(0, 2000))) {
      const refresh = metaRefresh(text, url);
      if (refresh && refresh !== url) {
        url = refresh;
        continue;
      }
      const onPage = triedPageLink ? null : calendarLinkIn(text, url);
      if (onPage && onPage !== url) {
        triedPageLink = true;
        foundUrl = onPage;
        url = onPage;
        continue;
      }
      throw new FeedError(NOT_A_CALENDAR);
    }
    throw new FeedError("The link returned something that isn't a calendar file. " + NOT_A_CALENDAR.split(". ").slice(1).join(". "));
  }
  throw new FeedError("The council calendar link redirected too many times.");
}

/** Plain text from a feed description (some calendars put HTML in it), at most `max` characters. */
export function plainDescription(s: string | null | undefined, max = 1500): string | null {
  if (!s) return null;
  const text = s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** The event's registration or detail page: the feed's URL field, or the first link in the description. */
export function eventLink(e: Pick<FeedEvent, "link" | "description">): string | null {
  if (e.link && /^https?:\/\//i.test(e.link)) return e.link.slice(0, 1000);
  const m = e.description?.match(/https?:\/\/[^\s<>"')\]]+/);
  return m ? m[0].replace(/[.,;:]+$/, "").slice(0, 1000) : null;
}

export interface CouncilRow {
  uid: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  url: string | null;
  description: string | null;
  categories: string | null;
}

/** council_events columns for one feed event. */
export function toCouncilRow(e: FeedEvent): CouncilRow {
  return {
    uid: e.uid.slice(0, 500),
    title: e.title.slice(0, 300) || "Council event",
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    all_day: e.all_day,
    location: e.location?.slice(0, 500) || null,
    url: eventLink(e),
    description: plainDescription(e.description),
    categories: e.categories?.slice(0, 300) || null,
  };
}

/**
 * Upcoming events in the feed (from yesterday to about 13 months out), one per UID, without
 * cancelled ones.
 */
export function councilFeed(text: string, now = Date.now()): CouncilRow[] {
  const from = Date.parse(startOfEasternDay()) - 86400000;
  const to = now + 400 * 86400000;
  const out = new Map<string, CouncilRow>();
  for (const e of parseIcs(text, to, from - 31 * 86400000)) {
    if (e.cancelled) continue;
    const start = Date.parse(e.starts_at);
    if (Date.parse(e.ends_at ?? e.starts_at) < from || start > to) continue;
    out.set(e.uid, toCouncilRow(e));
  }
  return [...out.values()];
}

export interface CouncilSyncResult {
  at: string;
  ok: boolean;
  /** No link saved yet: nothing was checked. */
  off?: boolean;
  /** Upcoming events in the council's feed. */
  feed: number;
  /** New to the list. */
  fresh: number;
  /** Already listed, and the council changed the title, time, place or link. */
  changed: number;
  /** Just left the council's feed. */
  removed: number;
  /** Back in the feed after leaving it. */
  back: number;
  /** Pack events kept in step with the council. */
  pack_updated: number;
  /** Why removals were held back this time, if they were. */
  skipped?: string;
  errors: string[];
  /** The whole check failed (couldn't download or read the calendar). */
  error?: string;
  /** The saved link opened a web page; this calendar link on it worked. */
  found_url?: string;
  /** When a check last worked. */
  last_ok_at?: string | null;
}

const sameTime = (a: string | null, b: string | null) => (a && b ? Date.parse(a) === Date.parse(b) : a === b);

interface Staged extends CouncilRow {
  removed_at: string | null;
  status: "new" | "added" | "skipped";
  event_id: string | null;
}

/** The saved status of the last check, or null. */
export function readCouncilStatus(value: string | null | undefined): CouncilSyncResult | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as CouncilSyncResult;
  } catch {
    return null;
  }
}

/** Check the council calendar and refresh council_events. `db` must be the secret-key client. */
export async function syncCouncil(db: SupabaseClient): Promise<CouncilSyncResult> {
  const stamp = new Date().toISOString();
  const result: CouncilSyncResult = { at: stamp, ok: true, feed: 0, fresh: 0, changed: 0, removed: 0, back: 0, pack_updated: 0, errors: [] };
  const { data: settings, error: settingsError } = await db.from("pack_settings").select("key, value").in("key", [COUNCIL_URL_KEY, COUNCIL_STATUS_KEY]);
  if (settingsError) throw new Error(`Couldn't read settings: ${settingsError.message}`);
  const link = (settings?.find((s) => s.key === COUNCIL_URL_KEY)?.value as string | undefined)?.trim() ?? "";
  const previous = readCouncilStatus(settings?.find((s) => s.key === COUNCIL_STATUS_KEY)?.value as string | undefined);
  if (!link) return { ...result, off: true };
  result.last_ok_at = previous?.ok ? previous.at : (previous?.last_ok_at ?? null);

  const save = async () => {
    await db.from("pack_settings").upsert({ key: COUNCIL_STATUS_KEY, value: JSON.stringify(result), updated_at: stamp });
  };
  const note = (msg: string) => {
    if (result.errors.length < 5) result.errors.push(msg);
  };

  try {
    const fetched = await fetchCouncilCalendar(link);
    if (fetched.foundUrl) result.found_url = fetched.foundUrl;
    const feed = councilFeed(fetched.text);
    result.feed = feed.length;

    const from = new Date(Date.parse(startOfEasternDay()) - 40 * 86400000).toISOString();
    const { data, error: readError } = await db
      .from("council_events")
      .select("uid, title, starts_at, ends_at, all_day, location, url, description, categories, removed_at, status, event_id")
      .gte("starts_at", from)
      .limit(5000);
    if (readError) throw new Error(`Couldn't read council events: ${readError.message}`);
    const staged = new Map(((data ?? []) as Staged[]).map((r) => [r.uid, r]));

    // 1. Add and refresh. Every row in the feed gets last_seen_at; status and decisions are
    //    left alone (new rows start as 'new').
    const packPatches: { eventId: string; patch: Record<string, unknown> }[] = [];
    for (const row of feed) {
      const old = staged.get(row.uid);
      if (!old) {
        result.fresh++;
        continue;
      }
      if (old.removed_at) result.back++;
      const moved = !sameTime(old.starts_at, row.starts_at) || !sameTime(old.ends_at, row.ends_at) || old.all_day !== row.all_day;
      if (old.title !== row.title || moved || old.location !== row.location || old.url !== row.url) result.changed++;
      // Pass the council's changes on to the pack event. Only what changed in the feed, so a
      // title the committee shortened when adding it stays until the council renames the event.
      if (old.status === "added" && old.event_id) {
        const patch: Record<string, unknown> = {};
        if (old.title !== row.title) patch.title = row.title.slice(0, 200);
        if (moved) Object.assign(patch, { starts_at: row.starts_at, ends_at: row.ends_at, all_day: row.all_day });
        if (old.location !== row.location) patch.location_name = row.location?.slice(0, 200) ?? null;
        if (old.url !== row.url && row.url) patch.signup_url = row.url;
        if (Object.keys(patch).length) packPatches.push({ eventId: old.event_id, patch });
      }
    }
    for (let i = 0; i < feed.length; i += 200) {
      const chunk = feed.slice(i, i + 200).map((r) => ({ ...r, last_seen_at: stamp, removed_at: null }));
      const { error } = await db.from("council_events").upsert(chunk, { onConflict: "uid" });
      if (error) note(`Saving council events: ${error.message}`);
    }

    // 2. Pack events made from council events, unless someone edited them in the app.
    if (packPatches.length) {
      const { data: events } = await db
        .from("events")
        .select("id, source")
        .in("id", packPatches.map((p) => p.eventId));
      const ours = new Set((events ?? []).filter((e) => e.source === "council").map((e) => e.id as string));
      for (const p of packPatches.filter((p) => ours.has(p.eventId))) {
        const { error } = await db.from("events").update(p.patch).eq("id", p.eventId);
        if (error) note(`Updating a pack event: ${error.message}`);
        else result.pack_updated++;
      }
    }

    // 3. Upcoming events that left the feed: mark them removed (never delete). Not when the
    //    feed looks broken (empty, or missing most of what we already have): that's an outage
    //    or a changed link, not the council clearing its calendar.
    const nowMs = Date.now();
    const inFeed = new Set(feed.map((r) => r.uid));
    const upcoming = [...staged.values()].filter((r) => !r.removed_at && Date.parse(r.ends_at ?? r.starts_at) >= nowMs);
    const gone = upcoming.filter((r) => !inFeed.has(r.uid));
    const stillThere = upcoming.length - gone.length;
    if (gone.length) {
      if (!feed.length) result.skipped = "The council calendar came back empty, so nothing was marked as removed.";
      else if (upcoming.length >= 10 && stillThere < upcoming.length / 2)
        result.skipped = `Only ${stillThere} of ${upcoming.length} upcoming council events were in the calendar, so nothing was marked as removed. Check the link.`;
      else {
        for (let i = 0; i < gone.length; i += 200) {
          const { error } = await db
            .from("council_events")
            .update({ removed_at: stamp })
            .in("uid", gone.slice(i, i + 200).map((r) => r.uid));
          if (error) note(`Marking removed events: ${error.message}`);
          else result.removed += Math.min(200, gone.length - i);
        }
      }
    }
    result.ok = !result.errors.length && !result.skipped;
    if (result.ok) result.last_ok_at = stamp;
    await save();
    return result;
  } catch (e) {
    result.ok = false;
    result.error = e instanceof Error ? e.message : "The check failed.";
    await save();
    throw e;
  }
}

/** One line about a check, for the committee. */
export function councilSummary(r: CouncilSyncResult): string {
  if (r.off) return "Add the council calendar link first.";
  if (r.error) return r.error;
  const parts = [`${r.fresh} new`];
  if (r.changed) parts.push(`${r.changed} changed`);
  if (r.removed) parts.push(`${r.removed} removed from the council calendar`);
  if (r.back) parts.push(`${r.back} back on it`);
  if (r.pack_updated) parts.push(`${r.pack_updated} of our events updated to match`);
  let s = `Checked ${r.feed} upcoming council events: ${parts.join(", ")}.`;
  if (r.found_url) s += ` The saved link opened a web page; the calendar link on it worked (${r.found_url}). Save that link instead.`;
  if (r.skipped) s += ` ${r.skipped}`;
  if (r.errors.length) s += ` Problems: ${r.errors.join("; ")}`;
  return s;
}
