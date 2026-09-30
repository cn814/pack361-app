import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DenRank } from "./types";

// TroopWebHost calendar sync. TroopWebHost gives each user a private iCalendar subscription
// link (My Stuff -> Subscribe to Calendar); TWH_CALENDAR_URL holds an admin's link. The sync
// adds and updates the pack's events from it, links events that already exist in the app
// (campout, picnic) instead of duplicating them, and removes events deleted in TroopWebHost.
// App-only details (volunteer jobs, campout pages, ranks, leader-only) are never overwritten.

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
  /** The event's page on TroopWebHost (where families RSVP), when the feed includes it. */
  url: string | null;
}

/** A TroopWebHost / OurGroupOnline link, if the text contains one. */
function twhLink(s: string | null | undefined): string | null {
  const m = s?.match(/https?:\/\/[^\s<>"')]*(troopwebhost|ourgrouponline)[^\s<>"')]*/i);
  return m ? m[0] : null;
}

/** Where families RSVP when an event has no direct TroopWebHost link. */
export const TWH_HOME = process.env.NEXT_PUBLIC_TWH_URL ?? "https://www.troopwebhostcs.org/Pack361EllicottCity/";

const unescape = (v: string) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();

/** Wall-clock time in America/New_York -> ISO. */
function eastern(y: number, mo: number, d: number, h: number, mi: number): string {
  const probe = new Date(Date.UTC(y, mo - 1, d, 12));
  const off = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")!
    .value.replace("GMT", "");
  return new Date(Date.UTC(y, mo - 1, d, h - Number(off || 0), mi)).toISOString();
}

function parseDate(params: string, value: string): { iso: string; allDay: boolean } | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  if (!h || /VALUE=DATE(?!-)/i.test(params)) return { iso: eastern(+y, +mo, +d, 0, 0), allDay: true };
  if (z) return { iso: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi)).toISOString(), allDay: false };
  // TZID=... or floating time: TroopWebHost units here are all Eastern.
  return { iso: eastern(+y, +mo, +d, +h, +mi), allDay: false };
}

export function parseIcs(text: string): FeedEvent[] {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out: FeedEvent[] = [];
  let cur: Record<string, { params: string; value: string }> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT" && cur) {
      const start = cur.DTSTART && parseDate(cur.DTSTART.params, cur.DTSTART.value);
      if (cur.UID && start) {
        let end = cur.DTEND ? parseDate(cur.DTEND.params, cur.DTEND.value) : null;
        // All-day DTEND is exclusive: a one-day event ends the next day.
        if (end && start.allDay && end.allDay) {
          const days = (new Date(end.iso).getTime() - new Date(start.iso).getTime()) / 86400000;
          end = days <= 1.05 ? null : { iso: new Date(new Date(end.iso).getTime() - 86400000).toISOString(), allDay: true };
        }
        out.push({
          uid: cur.UID.value.trim(),
          title: unescape(cur.SUMMARY?.value ?? "Pack event"),
          description: cur.DESCRIPTION ? unescape(cur.DESCRIPTION.value) || null : null,
          location: cur.LOCATION ? unescape(cur.LOCATION.value) || null : null,
          starts_at: start.iso,
          ends_at: end?.iso ?? null,
          all_day: start.allDay,
          cancelled: /CANCELLED/i.test(cur.STATUS?.value ?? ""),
          url: twhLink(cur.URL?.value) ?? twhLink(cur.DESCRIPTION ? unescape(cur.DESCRIPTION.value) : null),
        });
      }
      cur = null;
    } else if (cur) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const [name, ...params] = line.slice(0, i).split(";");
      cur[name.toUpperCase()] = { params: params.join(";"), value: line.slice(i + 1) };
    }
  }
  return out;
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

const easternDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !["the", "and", "pack", "361", "for"].includes(w)),
  );
function similar(a: string, b: string) {
  const A = words(a);
  const B = words(b);
  let same = 0;
  for (const w of A) if (B.has(w)) same++;
  return same > 0 && same >= Math.min(A.size, B.size) / 2;
}
const firstUrl = (s: string | null) =>
  (s?.match(/https?:\/\/[^\s<>"')]+/g) ?? []).find((u) => !/troopwebhost|ourgrouponline/i.test(u)) ?? null;

export interface SyncResult {
  added: number;
  updated: number;
  linked: number;
  removed: number;
  kept: number;
  feed: number;
}

interface Row {
  id: string;
  title: string;
  starts_at: string;
  source: string | null;
  twh_uid: string | null;
  details: string | null;
  signup_url: string | null;
  slots: { id: string }[];
}

export async function syncTwh(db: SupabaseClient): Promise<SyncResult> {
  const url = process.env.TWH_CALENDAR_URL?.trim();
  if (!url) throw new Error("TWH_CALENDAR_URL is not set");
  if (!/^(https?|webcal):\/\//i.test(url)) {
    throw new Error("The saved TroopWebHost link isn't a web address. Copy the link that starts with https:// or webcal:// from My Stuff → Subscribe to Calendar.");
  }
  const res = await fetch(url.replace(/^webcal:/i, "https:"), { cache: "no-store" });
  if (!res.ok) throw new Error(`TroopWebHost returned ${res.status}`);
  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("That link didn't return a calendar");

  const now = Date.now();
  const from = new Date(now - 30 * 86400000).toISOString();
  const to = new Date(now + 400 * 86400000).toISOString();
  const feed = parseIcs(text).filter((e) => !e.cancelled && e.starts_at >= from && e.starts_at <= to);

  const { data } = await db
    .from("events")
    .select("id, title, starts_at, source, twh_uid, details, signup_url, slots:volunteer_slots(id)")
    .gte("starts_at", from)
    .lte("starts_at", to);
  const rows = (data ?? []) as Row[];
  const byUid = new Map(rows.filter((r) => r.twh_uid).map((r) => [r.twh_uid!, r]));
  const claimed = new Set<string>();
  const result: SyncResult = { added: 0, updated: 0, linked: 0, removed: 0, kept: 0, feed: feed.length };
  const stamp = new Date().toISOString();

  for (const e of feed) {
    let row = byUid.get(e.uid);
    if (!row) {
      row = rows.find(
        (r) => !r.twh_uid && !claimed.has(r.id) && easternDay(r.starts_at) === easternDay(e.starts_at) && similar(r.title, e.title),
      );
      if (row) {
        await db.from("events").update({ twh_uid: e.uid, twh_url: e.url, twh_synced_at: stamp }).eq("id", row.id);
        result.linked++;
      }
    }
    if (row) {
      claimed.add(row.id);
      if (row.source !== "troopwebhost") await db.from("events").update({ twh_url: e.url, twh_synced_at: stamp }).eq("id", row.id);
      // Only events that came from TroopWebHost follow its title, time and place.
      if (row.source === "troopwebhost") {
        const patch = {
          title: e.title.slice(0, 200),
          starts_at: e.starts_at,
          ends_at: e.ends_at,
          all_day: e.all_day,
          location_name: e.location,
          details: e.description ?? row.details,
          signup_url: row.signup_url ?? firstUrl(e.description),
          twh_url: e.url,
          twh_synced_at: stamp,
        };
        await db.from("events").update(patch).eq("id", row.id);
        result.updated++;
      }
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
    if (!error) result.added++;
  }

  // Deleted in TroopWebHost: remove upcoming events that came from it, unless people have
  // already signed up to volunteer (a leader can delete those by hand).
  const feedUids = new Set(feed.map((e) => e.uid));
  for (const r of rows) {
    if (r.source !== "troopwebhost" || claimed.has(r.id) || r.starts_at < new Date(now).toISOString()) continue;
    if (r.twh_uid && feedUids.has(r.twh_uid)) continue;
    if (r.slots.length) {
      result.kept++;
      continue;
    }
    await db.from("events").delete().eq("id", r.id);
    result.removed++;
  }

  await db
    .from("pack_settings")
    .upsert({ key: "twh_last_sync", value: JSON.stringify({ at: stamp, ...result }), updated_at: stamp });
  return result;
}
