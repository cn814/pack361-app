import "server-only";
import https from "node:https";
import { promises as dns, type LookupAddress } from "node:dns";
import { BlockList, isIP } from "node:net";
import zlib from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseIcs, type FeedEvent } from "./twh";
import { easternDate, easternParts, easternWallToIso, startOfEasternDay } from "./tz";

// Baltimore Area Council calendar (Black Pug Software's ScoutingEvent). Leaders save the
// calendar's subscription link in pack_settings.council_calendar_url. Every day (and from the
// "Check now" button) the sync copies the feed into council_events, where leaders pick
// which events go on the pack calendar (/events/council). It never deletes and never puts
// anything on the pack calendar by itself: it only
//   - adds and refreshes council_events rows, and marks the ones that left the feed (removed_at);
//   - keeps the title, time and place of pack events made from a council event in step with
//     the council, as long as nobody edited them in the app (events.source stays 'council').
// It writes with the secret-key client: leaders can't insert council_events rows,
// and not everyone who presses "Check now" can write pack_settings.
//
// The link is typed in by a person, so the download only goes to public https addresses:
// every hop's host is looked up first and refused if any address is private, loopback or
// link-local, and the connection uses exactly the addresses that were checked.

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
  "Accept-Encoding": "gzip, deflate, br",
  "User-Agent": "Pack361-CalendarSync/1.0 (iCalendar subscription client)",
};
const MAX_HOPS = 6;
/** The real council feed is about 400 KB. */
export const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 20000;

export const NOT_A_CALENDAR =
  "The link didn't return a calendar file (it returned a web page). In the council calendar, choose Subscribe → Outlook or Google, then copy the address that starts with webcal:// or ends in .ics, and save that here.";
const NOT_ALLOWED = "The council calendar link points to an address the app won't connect to. Use the public webcal:// or https:// link from the council calendar.";
const TOO_LARGE = "The council calendar file is too large.";

/** A problem worth showing to leaders as is. Messages never include server details. */
export class FeedError extends Error {}

/** https:// form of a calendar link (webcal:// → https://), or null if it isn't a public https address. */
export function normalizeFeedUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().replace(/^webcals?:\/\//i, "https://");
  if (!/^https:\/\/\S+$/i.test(s)) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

// Addresses the download never connects to.
const BLOCKED = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], // "this network", including 0.0.0.0
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (cloud metadata)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, broadcast
] as const)
  BLOCKED.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  // IPv4-mapped addresses (::ffff:10.0.0.1) are checked against the IPv4 rules by BlockList
  // itself; a ::ffff:0:0/96 rule here would match every IPv4 address.
  ["::", 96], // unspecified, loopback (::1), IPv4-compatible
  ["64:ff9b::", 96], // NAT64
  ["100::", 64], // discard
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
] as const)
  BLOCKED.addSubnet(net, prefix, "ipv6");

/** Is this an address the download must not connect to? (Anything that isn't an IP counts.) */
export function isBlockedAddress(address: string): boolean {
  const v = isIP(address);
  if (!v) return true;
  return BLOCKED.check(address, v === 4 ? "ipv4" : "ipv6");
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

/** What one request returned: status, headers, and the (not yet read) body. */
export interface FeedResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: NodeJS.ReadableStream & { destroy(error?: Error): unknown };
}

/** How the download looks up hosts and makes requests (replaceable in checks). */
export interface FeedTransport {
  resolve(hostname: string): Promise<LookupAddress[]>;
  get(url: URL, addresses: LookupAddress[], signal: AbortSignal): Promise<FeedResponse>;
}

/** GET over https, connecting only to the addresses that were already checked. */
function httpsGet(url: URL, addresses: LookupAddress[], signal: AbortSignal): Promise<FeedResponse> {
  // Hands Node the checked addresses instead of looking the host up again, so a DNS answer
  // that changes between the check and the connection can't point somewhere else.
  const lookup = (_host: string, opts: { all?: boolean }, cb: (...args: unknown[]) => void) => {
    if (opts?.all) cb(null, addresses);
    else cb(null, addresses[0].address, addresses[0].family);
  };
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: "GET", headers: FETCH_HEADERS, signal, lookup: lookup as unknown as https.RequestOptions["lookup"] },
      (res) => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: res }),
    );
    req.on("error", reject);
    req.end();
  });
}

const defaultTransport: FeedTransport = {
  resolve: (hostname) => dns.lookup(hostname, { all: true, verbatim: true }),
  get: httpsGet,
};

const header = (r: FeedResponse, name: string) => {
  const v = r.headers[name];
  return (Array.isArray(v) ? v[0] : v) ?? null;
};

/** The body as text, decompressed, stopping with an error past MAX_BYTES. */
async function readCapped(r: FeedResponse): Promise<string> {
  if (Number(header(r, "content-length") ?? 0) > MAX_BYTES) {
    r.body.destroy();
    throw new FeedError(TOO_LARGE);
  }
  const enc = String(header(r, "content-encoding") ?? "").trim().toLowerCase();
  const unzip = enc === "gzip" || enc === "x-gzip" ? zlib.createGunzip() : enc === "deflate" ? zlib.createInflate() : enc === "br" ? zlib.createBrotliDecompress() : null;
  const stream: AsyncIterable<Buffer> = unzip ? (r.body.pipe(unzip) as AsyncIterable<Buffer>) : (r.body as AsyncIterable<Buffer>);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_BYTES) {
      r.body.destroy();
      unzip?.destroy();
      throw new FeedError(TOO_LARGE);
    }
    chunks.push(chunk);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

/** A plain-words reason for a failed connection, without addresses or server messages. */
function networkReason(e: unknown): string {
  const err = e as { name?: string; code?: string; cause?: { name?: string; code?: string } };
  const name = err?.name ?? err?.cause?.name;
  const code = err?.code ?? err?.cause?.code;
  if (name === "TimeoutError" || name === "AbortError" || code === "ABORT_ERR") return "it took too long to answer";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "the address wasn't found";
  if (typeof code === "string" && /CERT|SSL|TLS/i.test(code)) return "its security certificate didn't check out";
  return "network error";
}

/** Look up a host and make sure every address it has is public. */
async function publicAddresses(t: FeedTransport, hostname: string): Promise<LookupAddress[]> {
  const host = hostname.replace(/^\[|\]$/g, "");
  let addresses: LookupAddress[];
  try {
    addresses = await t.resolve(host);
  } catch (e) {
    throw new FeedError(`Couldn't reach the council calendar (${networkReason(e)}).`);
  }
  if (!addresses.length || addresses.some((a) => isBlockedAddress(a.address))) throw new FeedError(NOT_ALLOWED);
  return addresses;
}

export interface FetchedCalendar {
  text: string;
  /** Set when the saved link returned a web page and a calendar link on it worked instead. */
  foundUrl?: string;
}

/**
 * Download the calendar file over https. Follows redirects (including ones to webcal://) and
 * simple page redirects; if the link opens a web page that has a calendar link on it, tries
 * that once. Accepts the result only if it is an iCalendar file (starts with BEGIN:VCALENDAR).
 */
export async function fetchCouncilCalendar(link: string, transport: FeedTransport = defaultTransport): Promise<FetchedCalendar> {
  const first = normalizeFeedUrl(link);
  if (!first) throw new FeedError("The saved council calendar link isn't a public web address. It should start with webcal:// or https://.");
  let url: string = first;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let foundUrl: string | undefined;
  let triedPageLink = false;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const target = new URL(url);
    const addresses = await publicAddresses(transport, target.hostname);
    let res: FeedResponse;
    try {
      res = await transport.get(target, addresses, signal);
    } catch (e) {
      throw new FeedError(`Couldn't reach the council calendar (${networkReason(e)}).`);
    }
    if (res.status >= 300 && res.status < 400) {
      res.body.destroy();
      const next = header(res, "location");
      let to: string | null = null;
      try {
        to = next ? normalizeFeedUrl(new URL(next.replace(/^webcals?:\/\//i, "https://"), url).toString()) : null;
      } catch {
        to = null;
      }
      if (!to) throw new FeedError(`The council calendar link redirected somewhere the app won't follow (${res.status}).`);
      url = to;
      continue;
    }
    if (res.status < 200 || res.status >= 300) {
      res.body.destroy();
      throw new FeedError(`The council calendar answered with an error (${res.status}). Check the link.`);
    }
    let text: string;
    try {
      text = (await readCapped(res)).replace(/^﻿/, "");
    } catch (e) {
      if (e instanceof FeedError) throw e;
      throw new FeedError(`Couldn't reach the council calendar (${networkReason(e)}).`);
    }
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

const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i;
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
};

/**
 * The event's registration or detail page: from the feed's URL field or the links in the
 * description, preferring the council's own site (scoutingevent.com) and skipping pictures
 * (one district's events link to its logo).
 */
export function eventLink(e: Pick<FeedEvent, "link" | "description">): string | null {
  const links = [e.link, ...(e.description?.match(/https?:\/\/[^\s<>"')\]]+/g) ?? [])]
    .filter((u): u is string => Boolean(u && /^https?:\/\//i.test(u)))
    .map((u) => u.replace(/[.,;:]+$/, ""))
    .filter((u) => {
      try {
        return !IMAGE.test(new URL(u).pathname);
      } catch {
        return false;
      }
    });
  const best = links.find((u) => /(^|\.)scoutingevent\.com$/i.test(hostOf(u))) ?? links[0];
  return best ? best.slice(0, 1000) : null;
}

const dayBefore = (ymd: string) => new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10) - 1)).toISOString().slice(0, 10);

/**
 * The council's feed (exported from Outlook) writes all-day events as midnight to 11:59 PM
 * Eastern, in UTC (DTSTART:20401225T050000Z, DTEND:20401226T045959Z). Treat those, and
 * midnight to midnight, as all-day: ends_at is the last day's midnight, or null for one day.
 */
export function allDaySpan(startsAt: string, endsAt: string | null): { starts_at: string; ends_at: string | null } | null {
  if (!endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) return null;
  const s = easternParts(startsAt);
  const e = easternParts(endsAt);
  if (s.h !== 0 || s.mi !== 0) return null;
  const toMidnight = e.h === 0 && e.mi === 0;
  if (!toMidnight && !(e.h === 23 && e.mi === 59)) return null;
  const first = easternDate(startsAt);
  const last = toMidnight ? dayBefore(easternDate(endsAt)) : easternDate(endsAt);
  if (last < first) return null;
  return { starts_at: startsAt, ends_at: last === first ? null : easternWallToIso(+last.slice(0, 4), +last.slice(5, 7), +last.slice(8, 10)) };
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
  const span = e.all_day ? null : allDaySpan(e.starts_at, e.ends_at);
  return {
    uid: e.uid.slice(0, 500),
    title: e.title.slice(0, 300) || "Council event",
    ...(span ? { ...span, all_day: true } : { starts_at: e.starts_at, ends_at: e.ends_at, all_day: e.all_day }),
    location: e.location?.slice(0, 500) || null,
    url: eventLink(e),
    description: plainDescription(e.description),
    categories: e.categories?.slice(0, 1000) || null,
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
export async function syncCouncil(db: SupabaseClient, transport?: FeedTransport): Promise<CouncilSyncResult> {
  const stamp = new Date().toISOString();
  const result: CouncilSyncResult = { at: stamp, ok: true, feed: 0, fresh: 0, changed: 0, removed: 0, back: 0, pack_updated: 0, errors: [] };
  const { data: settings, error: settingsError } = await db.from("pack_settings").select("key, value").in("key", [COUNCIL_URL_KEY, COUNCIL_STATUS_KEY]);
  if (settingsError) {
    console.error("Council calendar: reading pack_settings", settingsError);
    throw new FeedError("Couldn't read the pack settings.");
  }
  const link = (settings?.find((s) => s.key === COUNCIL_URL_KEY)?.value as string | undefined)?.trim() ?? "";
  const previous = readCouncilStatus(settings?.find((s) => s.key === COUNCIL_STATUS_KEY)?.value as string | undefined);
  if (!link) return { ...result, off: true };
  result.last_ok_at = previous?.ok ? previous.at : (previous?.last_ok_at ?? null);

  const save = async () => {
    await db.from("pack_settings").upsert({ key: COUNCIL_STATUS_KEY, value: JSON.stringify(result), updated_at: stamp });
  };
  // Everyone in the pack can read pack_settings, so the saved status holds plain words only;
  // the details go to the server log.
  const note = (msg: string, detail?: unknown) => {
    if (detail) console.error(`Council calendar: ${msg}`, detail);
    if (!result.errors.includes(msg) && result.errors.length < 5) result.errors.push(msg);
  };

  try {
    const fetched = await fetchCouncilCalendar(link, transport);
    if (fetched.foundUrl) result.found_url = fetched.foundUrl;
    const feed = councilFeed(fetched.text);
    result.feed = feed.length;

    const from = new Date(Date.parse(startOfEasternDay()) - 40 * 86400000).toISOString();
    const { data, error: readError } = await db
      .from("council_events")
      .select("uid, title, starts_at, ends_at, all_day, location, url, description, categories, removed_at, status, event_id")
      .gte("starts_at", from)
      .limit(5000);
    if (readError) {
      console.error("Council calendar: reading council_events", readError);
      throw new FeedError("Couldn't read the saved council events.");
    }
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
      // title leaders shortened when adding it stays until the council renames the event.
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
      if (error) note("Some council events couldn't be saved.", error);
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
        if (error) note("A pack event couldn't be updated to match the council.", error);
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
          if (error) note("Events removed from the council calendar couldn't be marked.", error);
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
    if (e instanceof FeedError) result.error = e.message;
    else {
      console.error("Council calendar check failed", e);
      result.error = "The check failed. The details are in the server log.";
    }
    await save();
    throw new FeedError(result.error);
  }
}

/** One line about a check, for leaders. */
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
