import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DenRank } from "./types";
import { twhEventUrl } from "./twh-link";
import { addDays, daysBetween, easternDate, easternParts, easternWallToIso } from "./tz";

// TroopWebHost calendar sync. TroopWebHost gives each user a private iCalendar subscription
// link (My Stuff -> Subscribe to Calendar); TWH_CALENDAR_URL holds an admin's link. The sync
// adds and updates the pack's events from it and links events that already exist in the app
// (campout, picnic) instead of duplicating them. It never deletes: an event that disappears
// from TroopWebHost moves to the archive (and comes back if it reappears). App-only details
// (volunteer jobs, campout pages, ranks, leader-only, a leader's "hide") are never overwritten.

export function twhConfigured(): boolean {
  return Boolean(process.env.TWH_CALENDAR_URL?.trim());
}

export interface FeedEvent {
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  cancelled: boolean;
  /** The event's page on TroopWebHost (where families RSVP). */
  url: string | null;
  /** The feed's own URL field, whatever site it points to. */
  link: string | null;
  /** CATEGORIES, comma-separated. */
  categories: string | null;
}

/** A TroopWebHost / OurGroupOnline link, if the text contains one. */
function twhLink(s: string | null | undefined): string | null {
  const m = s?.match(/https?:\/\/[^\s<>"')]*(troopwebhost|ourgrouponline)[^\s<>"')]*/i);
  return m ? m[0] : null;
}

const unescape = (v: string) =>
  v
    .replace(/\r(?!\n)/g, "")
    .replace(/\\n/gi, "\n")
    .replace(/\\([,;\\])/g, "$1")
    .trim();

interface IcsDate {
  iso: string;
  allDay: boolean;
}

function parseDate(params: string, value: string): IcsDate | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  if (!h || /VALUE=DATE(?!-)/i.test(params)) return { iso: easternWallToIso(+y, +mo, +d), allDay: true };
  if (z) return { iso: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi)).toISOString(), allDay: false };
  // TZID=... or floating time: TroopWebHost units here are all Eastern.
  return { iso: easternWallToIso(+y, +mo, +d, +h, +mi), allDay: false };
}

type Props = Record<string, { params: string; value: string; all: string[] }>;

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const MAX_REPEATS = 400;

/**
 * Dates (Eastern YYYYMMDD) a repeating event falls on, from its RRULE. Handles the patterns a
 * unit calendar uses: daily, weekly (with BYDAY), monthly on a date or an nth weekday
 * (BYDAY=2MO), yearly; with INTERVAL, COUNT and UNTIL. Stops at `until`.
 */
function expandRule(rule: string, start: string, until: number, from: number): string[] {
  const r = Object.fromEntries(rule.split(";").map((kv) => kv.split("=") as [string, string]));
  const freq = r.FREQ;
  const interval = Math.max(1, Number(r.INTERVAL) || 1);
  const count = Number(r.COUNT) || Infinity;
  const endAt = r.UNTIL ? Date.UTC(+r.UNTIL.slice(0, 4), +r.UNTIL.slice(4, 6) - 1, +r.UNTIL.slice(6, 8), 23, 59) : Infinity;
  const [y0, m0, d0] = [+start.slice(0, 4), +start.slice(4, 6) - 1, +start.slice(6, 8)];
  const first = Date.UTC(y0, m0, d0);
  const out: string[] = [];
  // COUNT counts every date from the first one; the cap only counts dates we keep (from `from`
  // on), so a series that started years ago still reaches today.
  let seen = 0;
  const push = (ms: number) => {
    if (ms < first || ms > endAt || ms > until || seen >= count || out.length >= MAX_REPEATS) return false;
    seen++;
    if (ms >= from) out.push(new Date(ms).toISOString().slice(0, 10).replace(/-/g, ""));
    return true;
  };
  const byday = (r.BYDAY ?? "").split(",").filter(Boolean);
  for (let i = 0; seen < count && out.length < MAX_REPEATS; i++) {
    let periodStart: number;
    if (freq === "DAILY") periodStart = Date.UTC(y0, m0, d0 + i * interval);
    else if (freq === "WEEKLY") periodStart = Date.UTC(y0, m0, d0 - new Date(first).getUTCDay() + i * 7 * interval);
    else if (freq === "MONTHLY") periodStart = Date.UTC(y0, m0 + i * interval, 1);
    else if (freq === "YEARLY") periodStart = Date.UTC(y0 + i * interval, m0, d0);
    else return [start];
    if (periodStart > Math.min(endAt, until)) break;
    if (freq === "DAILY" || freq === "YEARLY") push(periodStart);
    else if (freq === "WEEKLY") {
      const want = byday.length ? byday.map((b) => DAYS.indexOf(b.slice(-2))) : [new Date(first).getUTCDay()];
      for (const wd of want.sort()) push(periodStart + wd * 86400000);
    } else {
      const month = new Date(periodStart);
      const [yy, mm] = [month.getUTCFullYear(), month.getUTCMonth()];
      const len = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
      if (!byday.length) {
        if (d0 <= len) push(Date.UTC(yy, mm, d0));
      } else {
        const hits: number[] = [];
        for (const b of byday) {
          const n = Number(b.slice(0, -2)) || 0;
          const wd = DAYS.indexOf(b.slice(-2));
          const days = Array.from({ length: len }, (_, k) => k + 1).filter((dd) => new Date(Date.UTC(yy, mm, dd)).getUTCDay() === wd);
          if (!n) hits.push(...days);
          else {
            const pick = n > 0 ? days[n - 1] : days[days.length + n];
            if (pick) hits.push(pick);
          }
        }
        for (const dd of hits.sort((a, b) => a - b)) push(Date.UTC(yy, mm, dd));
      }
    }
    if (i > 20000) break;
  }
  return out;
}

/** The Eastern calendar day (YYYYMMDD) of a DTSTART / EXDATE / RECURRENCE-ID value. */
function icsDay(params: string, value: string): string {
  const d = parseDate(params, value);
  return d ? easternDate(d.iso).replace(/-/g, "") : value.slice(0, 8);
}

export function parseIcs(text: string, until = Date.now() + 400 * 86400000, from = Date.now() - 60 * 86400000): FeedEvent[] {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const series = new Map<string, FeedEvent[]>(); // uid -> instances
  const overrides: { uid: string; day: string; ev: FeedEvent }[] = [];
  let cur: Props | null = null;
  let nested = 0; // inside a VALARM (or other block) within an event: its lines aren't the event's
  for (const line of lines) {
    if (cur && line.startsWith("BEGIN:") && line !== "BEGIN:VEVENT") nested++;
    else if (nested) {
      if (line.startsWith("END:")) nested--;
    } else if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT" && cur) {
      const start = cur.DTSTART && parseDate(cur.DTSTART.params, cur.DTSTART.value);
      if (cur.UID && start) {
        let end = cur.DTEND ? parseDate(cur.DTEND.params, cur.DTEND.value) : null;
        // All-day DTEND is exclusive: a one-day event ends the next day.
        // Calendar-day math (not -24h) so a span across a DST change keeps the right last day.
        if (end && start.allDay && end.allDay) {
          const last = addDays(easternDate(end.iso), -1);
          end = last <= easternDate(start.iso) ? null : { iso: easternWallToIso(+last.slice(0, 4), +last.slice(5, 7), +last.slice(8, 10)), allDay: true };
        }
        const uid = cur.UID.value.trim();
        const description = cur.DESCRIPTION ? unescape(cur.DESCRIPTION.value) || null : null;
        const base: FeedEvent = {
          uid,
          title: unescape(cur.SUMMARY?.value ?? "Pack event"),
          description,
          location: cur.LOCATION ? unescape(cur.LOCATION.value) || null : null,
          starts_at: start.iso,
          ends_at: end?.iso ?? null,
          all_day: start.allDay,
          cancelled: /CANCELLED/i.test(cur.STATUS?.value ?? ""),
          url: twhLink(cur.URL?.value) ?? twhLink(description) ?? twhEventUrl(uid),
          link: cur.URL ? unescape(cur.URL.value) || null : null,
          categories: cur.CATEGORIES ? cur.CATEGORIES.all.map(unescape).filter(Boolean).join(", ") || null : null,
        };
        if (cur["RECURRENCE-ID"]) {
          // One changed date of a repeating event: replaces that date's copy.
          overrides.push({ uid, day: icsDay(cur["RECURRENCE-ID"].params, cur["RECURRENCE-ID"].value), ev: base });
        } else if (cur.RRULE) {
          const s = easternParts(start.iso);
          // Eastern days throughout: a UTC start of 00:30Z is still the evening before here.
          const startDay = easternDate(start.iso).replace(/-/g, "");
          const exParams = cur.EXDATE?.params ?? "";
          const skip = new Set((cur.EXDATE?.all ?? []).flatMap((v) => v.split(",")).map((v) => icsDay(exParams, v)));
          const length = end ? new Date(end.iso).getTime() - new Date(start.iso).getTime() : null;
          // All-day copies keep the same number of calendar days, whatever DST does in between.
          const spanDays = end && start.allDay ? daysBetween(easternDate(start.iso), easternDate(end.iso)) : null;
          const copies = expandRule(cur.RRULE.value, startDay, until, from)
            .filter((day) => !skip.has(day))
            .map((day) => {
              const iso = start.allDay
                ? easternWallToIso(+day.slice(0, 4), +day.slice(4, 6), +day.slice(6, 8))
                : easternWallToIso(+day.slice(0, 4), +day.slice(4, 6), +day.slice(6, 8), s.h, s.mi);
              return {
                ...base,
                uid: `${uid}#${day}`,
                starts_at: iso,
                ends_at:
                  length === null
                    ? null
                    : spanDays !== null
                      ? (() => {
                          const last = addDays(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`, spanDays);
                          return easternWallToIso(+last.slice(0, 4), +last.slice(5, 7), +last.slice(8, 10));
                        })()
                      : new Date(new Date(iso).getTime() + length).toISOString(),
              };
            });
          series.set(uid, copies);
        } else {
          series.set(uid, [base]);
        }
      }
      cur = null;
    } else if (cur) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const [name, ...params] = line.slice(0, i).split(";");
      const key = name.toUpperCase();
      const value = line.slice(i + 1);
      cur[key] = { params: params.join(";"), value, all: [...(cur[key]?.all ?? []), value] };
    }
  }
  for (const o of overrides) {
    const list = series.get(o.uid);
    const ev = { ...o.ev, uid: `${o.uid}#${o.day}` };
    if (!list) series.set(o.uid, [ev]);
    else {
      const at = list.findIndex((x) => x.uid === ev.uid);
      if (at >= 0) list[at] = ev;
      else list.push(ev);
    }
  }
  return [...series.values()].flat();
}


/** Category and ranks, guessed from the TroopWebHost title (new events only). */
export function classify(title: string): { category: string; ranks: DenRank[] | null; leaders_only: boolean } {
  const t = title.toLowerCase();
  const category = /den meeting/.test(t)
    ? "Den Meeting"
    : /pack meeting/.test(t)
      ? "Pack Meeting"
      : /camp ?out|camping|overnight/.test(t)
        ? "Campout"
        : /^council\b/.test(t)
          ? "Council"
          : /^district\b/.test(t)
            ? "District"
            : /committee/.test(t)
              ? "Committee"
              : /roundtable|leader training/.test(t)
                ? "Leaders"
                : /\bden\b/.test(t)
                  ? "Den"
                  : "Pack";
  const ranks: DenRank[] = [];
  if (/\blions?\b/.test(t)) ranks.push("lion");
  if (/\btigers?\b/.test(t)) ranks.push("tiger");
  if (/\bwol(f|ves)\b/.test(t)) ranks.push("wolf");
  if (/\bbears?\b/.test(t)) ranks.push("bear");
  if (/\bwebelos\b/.test(t)) ranks.push("webelos");
  if (/\baols?\b|arrow of light/.test(t)) ranks.push("aol");
  return {
    category,
    ranks: ranks.length && category !== "Pack Meeting" && category !== "Den Meeting" ? ranks : null,
    // Committee meetings and Roundtable are open to everyone: the pack wants more parents involved.
    leaders_only: false,
  };
}


const STOP = new Set(["the", "and", "pack", "361", "for", "with"]);
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
/**
 * How alike two titles are (0 = not a match). A one-word title ("Pack Meeting" -> meeting)
 * only matches the same single word, so "Pack Committee Meeting" can't claim it; longer titles
 * need two shared words.
 */
function similarity(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let same = 0;
  for (const w of A) if (B.has(w)) same++;
  const small = Math.min(A.size, B.size);
  if (small === 1 ? !(A.size === B.size && same === 1) : same < 2) return 0;
  return same / (A.size + B.size - same);
}
const firstUrl = (s: string | null) =>
  (s?.match(/https?:\/\/[^\s<>"')]+/g) ?? []).find((u) => !/troopwebhost|ourgrouponline/i.test(u)) ?? null;

export interface SyncResult {
  added: number;
  updated: number;
  unchanged: number;
  linked: number;
  archived: number;
  restored: number;
  feed: number;
  /** Why archiving was skipped this run, if it was. */
  skipped?: string;
  errors: string[];
}

interface Row {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location_name: string | null;
  source: string | null;
  twh_uid: string | null;
  twh_url: string | null;
  details: string | null;
  signup_url: string | null;
  archived_at: string | null;
  archived_reason: string | null;
}

const sameTime = (a: string | null, b: string | null) => (a && b ? new Date(a).getTime() === new Date(b).getTime() : a === b);

export async function syncTwh(db: SupabaseClient): Promise<SyncResult> {
  const url = process.env.TWH_CALENDAR_URL?.trim();
  if (!url) throw new Error("TWH_CALENDAR_URL is not set");
  if (!/^(https?|webcal):\/\//i.test(url)) {
    throw new Error("The saved TroopWebHost link isn't a web address. Copy the link that starts with https:// or webcal:// from My Stuff → Subscribe to Calendar.");
  }
  const res = await fetch(url.replace(/^webcal:/i, "https:"), { cache: "no-store", signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`TroopWebHost returned ${res.status}`);
  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("That link didn't return a calendar");

  const now = Date.now();
  const from = new Date(now - 30 * 86400000).toISOString();
  const to = new Date(now + 400 * 86400000).toISOString();
  const feed = parseIcs(text, now + 400 * 86400000, now - 31 * 86400000).filter((e) => !e.cancelled && e.starts_at >= from && e.starts_at <= to);

  const { data, error: readError } = await db
    .from("events")
    .select("id, title, starts_at, ends_at, all_day, location_name, source, twh_uid, twh_url, details, signup_url, archived_at, archived_reason")
    .gte("starts_at", from)
    .lte("starts_at", to);
  if (readError) throw new Error(`Couldn't read events: ${readError.message}`);
  const rows = (data ?? []) as Row[];
  const byUid = new Map(rows.filter((r) => r.twh_uid).map((r) => [r.twh_uid!, r]));
  const claimed = new Set<string>();
  const result: SyncResult = { added: 0, updated: 0, unchanged: 0, linked: 0, archived: 0, restored: 0, feed: feed.length, errors: [] };
  const stamp = new Date().toISOString();
  const note = (msg: string) => {
    if (result.errors.length < 5) result.errors.push(msg);
  };

  for (const e of feed) {
    let row = byUid.get(e.uid);
    // A repeating event synced before repeats were split up: its row has the bare UID.
    if (!row && e.uid.includes("#")) {
      const bare = byUid.get(e.uid.split("#")[0]);
      if (bare && !claimed.has(bare.id) && easternDate(bare.starts_at) === easternDate(e.starts_at)) row = bare;
    }
    if (!row) {
      // An event made in the app (campout, picnic) on the same day with a matching title.
      const day = easternDate(e.starts_at);
      row = rows
        .filter((r) => !r.twh_uid && !claimed.has(r.id) && easternDate(r.starts_at) === day)
        .map((r) => ({ r, score: similarity(r.title, e.title) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)[0]?.r;
      if (row) result.linked++;
    }
    if (row) {
      claimed.add(row.id);
      const patch: Record<string, unknown> = {};
      if (row.twh_uid !== e.uid) patch.twh_uid = e.uid;
      if (row.twh_url !== e.url) patch.twh_url = e.url;
      // Back in TroopWebHost after being removed there. (A leader's "hide" stays hidden.)
      if (row.archived_reason === "removed_in_twh") {
        patch.archived_at = null;
        patch.archived_reason = null;
        result.restored++;
      }
      // Only events that came from TroopWebHost follow its title, time and place.
      if (row.source === "troopwebhost") {
        const want = {
          title: e.title.slice(0, 200),
          location_name: e.location,
          details: e.description ?? row.details,
          signup_url: row.signup_url ?? firstUrl(e.description),
          all_day: e.all_day,
        };
        for (const [k, v] of Object.entries(want)) if (row[k as keyof Row] !== v) patch[k] = v;
        if (!sameTime(row.starts_at, e.starts_at)) patch.starts_at = e.starts_at;
        if (!sameTime(row.ends_at, e.ends_at)) patch.ends_at = e.ends_at;
      }
      if (Object.keys(patch).length) {
        const { error } = await db.from("events").update({ ...patch, twh_synced_at: stamp }).eq("id", row.id);
        if (error) note(`${e.title}: ${error.message}`);
        else result.updated++;
      } else result.unchanged++;
      continue;
    }
    const c = classify(e.title);
    const { error } = await db.from("events").insert({
      source: "troopwebhost",
      external_id: e.uid,
      twh_uid: e.uid,
      twh_url: e.url,
      twh_synced_at: stamp,
      title: e.title.slice(0, 200),
      category: c.category,
      ranks: c.ranks,
      leaders_only: c.leaders_only,
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      all_day: e.all_day,
      location_name: e.location,
      details: e.description,
      signup_url: firstUrl(e.description),
    });
    if (error) note(`${e.title}: ${error.message}`);
    else result.added++;
  }

  // Gone from TroopWebHost: move upcoming events that came from it to the archive. Never
  // delete, and don't archive at all when the feed looks broken (empty, or far fewer upcoming
  // events than we already have) — that's an outage or a changed link, not a real cleanup.
  const nowIso = new Date(now).toISOString();
  const feedUids = new Set(feed.map((e) => e.uid));
  const upcomingTwh = rows.filter((r) => r.twh_uid && !r.archived_at && r.starts_at >= nowIso);
  const stillThere = upcomingTwh.filter((r) => feedUids.has(r.twh_uid!)).length;
  const gone = rows.filter(
    (r) => r.source === "troopwebhost" && !claimed.has(r.id) && !r.archived_at && r.starts_at >= nowIso && !(r.twh_uid && feedUids.has(r.twh_uid)),
  );
  if (gone.length) {
    if (!feed.length) result.skipped = "TroopWebHost sent an empty calendar, so nothing was archived.";
    else if (upcomingTwh.length >= 6 && stillThere < upcomingTwh.length / 2)
      result.skipped = `Only ${stillThere} of ${upcomingTwh.length} upcoming TroopWebHost events were in the calendar, so nothing was archived. Check the link.`;
    else {
      const { error } = await db
        .from("events")
        .update({ archived_at: stamp, archived_reason: "removed_in_twh" })
        .in("id", gone.map((r) => r.id));
      if (error) note(`Archiving: ${error.message}`);
      else result.archived = gone.length;
    }
  }

  await db
    .from("pack_settings")
    .upsert({ key: "twh_last_sync", value: JSON.stringify({ at: stamp, ...result }), updated_at: stamp });
  return result;
}

/** One line for admins: what the sync did. */
export function syncSummary(r: SyncResult): string {
  const parts = [`${r.added} new`, `${r.updated} updated`, `${r.unchanged} unchanged`];
  if (r.linked) parts.push(`${r.linked} matched to existing`);
  if (r.archived) parts.push(`${r.archived} moved to the archive (removed in TroopWebHost)`);
  if (r.restored) parts.push(`${r.restored} back from the archive`);
  let s = `Synced ${r.feed} TroopWebHost events: ${parts.join(", ")}.`;
  if (r.skipped) s += ` ${r.skipped}`;
  if (r.errors.length) s += ` Problems: ${r.errors.join("; ")}`;
  return s;
}
