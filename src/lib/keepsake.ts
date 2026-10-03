import "server-only";
import { createClient } from "./supabase/server";
import { adminConfigured, createAdminClient } from "./supabase/admin";
import { getRecords } from "./advancement-data";
import { RANK_LABEL, awardLabel } from "./advancement";
import { getAttendanceTotals } from "./attendance-data";
import { seasonOf, seasonRange } from "./finance";
import { photosOk } from "./photo-permission";
import { PHOTO_BUCKET } from "./photos";
import { easternWallToIso } from "./tz";
import type { AttendanceTotals } from "./attendance";

// A printable season keepsake for one scout (July to June): ranks and adventures earned,
// attendance, pack events, and a few photos from those events. The page checks that the viewer is
// the scout's family or a leader; the database (RLS) decides everything read here as well.

export interface KeepsakeItem {
  label: string;
  date: string | null;
}

export interface KeepsakeEvent {
  id: string;
  title: string;
  starts_at: string;
  category: string;
}

export interface KeepsakePhoto {
  id: string;
  url: string;
  caption: string | null;
}

export interface Keepsake {
  season: string;
  from: string;
  to: string;
  ranks: KeepsakeItem[];
  adventures: KeepsakeItem[];
  awards: KeepsakeItem[];
  totals: AttendanceTotals | null;
  events: KeepsakeEvent[];
  /** Empty when the family opted out of photos (or there are none). */
  photos: KeepsakePhoto[];
  /** Seasons to choose from, newest first. */
  seasons: string[];
}

export const MAX_KEEPSAKE_PHOTOS = 6;

/** "2026-27" -> "2026–27" */
export const seasonLabel = (s: string) => s.replace("-", "–");

/** Up to `n` photos, taking one from each event in turn so the page isn't all one outing. */
export function spreadPhotos<T extends { event_id: string | null }>(photos: T[], n: number): T[] {
  const byEvent = new Map<string, T[]>();
  for (const p of photos) byEvent.set(p.event_id ?? "", [...(byEvent.get(p.event_id ?? "") ?? []), p]);
  const lists = [...byEvent.values()];
  const out: T[] = [];
  for (let i = 0; out.length < n && lists.some((l) => l.length > i); i++) {
    for (const l of lists) if (l[i] && out.length < n) out.push(l[i]);
  }
  return out;
}

export async function getKeepsake(scoutId: string, season: string, current: string): Promise<Keepsake | null> {
  const range = seasonRange(season);
  if (!range) return null;
  const supabase = await createClient();
  // Eastern midnight at the season's ends, for event start times.
  const fromIso = easternWallToIso(+range.from.slice(0, 4), 7, 1);
  const toIso = easternWallToIso(+range.to.slice(0, 4), 7, 1);

  const [records, totals, { data: attended }, { data: scoutRow }] = await Promise.all([
    getRecords([scoutId]),
    getAttendanceTotals(range.from, range.to, scoutId),
    supabase
      .from("event_attendance")
      .select("event:events!inner(id, title, starts_at, category)")
      .eq("scout_id", scoutId)
      .gte("event.starts_at", fromIso)
      .lt("event.starts_at", toIso),
    supabase.from("scouts").select("photo_permission").eq("id", scoutId).maybeSingle(),
  ]);

  const inSeason = (d: string | null) => !!d && d >= range.from && d <= range.to;
  const dedupe = (items: KeepsakeItem[]) => {
    const seen = new Set<string>();
    return items
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
      .filter((i) => (seen.has(i.label) ? false : (seen.add(i.label), true)));
  };
  const ranks = dedupe(
    records.filter((r) => r.kind === "rank" && inSeason(r.completed_on)).map((r) => ({ label: r.rank ? `${RANK_LABEL[r.rank]} rank` : r.item, date: r.completed_on })),
  );
  const adventures = dedupe(
    records
      .filter((r) => r.kind === "adventure" && inSeason(r.completed_on))
      .map((r) => ({ label: r.adventure ?? r.item, date: r.completed_on })),
  );
  const awards = dedupe(records.filter((r) => r.kind === "award" && inSeason(r.completed_on)).map((r) => ({ label: awardLabel(r), date: r.completed_on })));

  const events = ((attended ?? []) as unknown as { event: KeepsakeEvent | null }[])
    .map((r) => r.event)
    .filter((e): e is KeepsakeEvent => !!e)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  // Photos: approved ones from events the scout went to, unless the family opted out. Photos
  // aren't tagged per scout, so an event is skipped entirely when ANY scout recorded there opted
  // out. Families can't read other families' scouts, so that check uses the secret key, and only
  // after the viewer has been shown able to read this scout (RLS); without the key, no photos.
  let photos: KeepsakePhoto[] = [];
  const permission = (scoutRow?.photo_permission as "yes" | "no" | null | undefined) ?? null;
  const eventIds = events.map((e) => e.id);
  let safeIds: string[] = [];
  if (scoutRow && photosOk(permission) && eventIds.length && adminConfigured()) {
    const { data: optedOut, error: optErr } = await createAdminClient()
      .from("event_attendance")
      .select("event_id, scout:scouts!inner(photo_permission)")
      .in("event_id", eventIds)
      .eq("scout.photo_permission", "no");
    if (!optErr) {
      const blocked = new Set(((optedOut ?? []) as { event_id: string }[]).map((r) => r.event_id));
      safeIds = eventIds.filter((id) => !blocked.has(id));
    }
  }
  if (safeIds.length) {
    const { data: rows } = await supabase
      .from("photos")
      .select("id, storage_path, thumb_path, caption, event_id")
      .eq("status", "approved")
      .in("event_id", safeIds)
      .order("created_at")
      .limit(120);
    const picked = spreadPhotos((rows ?? []) as { id: string; storage_path: string; thumb_path: string | null; caption: string | null; event_id: string | null }[], MAX_KEEPSAKE_PHOTOS);
    if (picked.length) {
      const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(picked.map((p) => p.storage_path), 60 * 60);
      const url = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
      photos = picked
        .map((p) => ({ id: p.id, url: url.get(p.storage_path) ?? "", caption: p.caption }))
        .filter((p) => p.url);
    }
  }

  // Seasons: this one back to the earliest advancement or attendance (at most ten).
  const earliest = records.map((r) => r.completed_on).filter(Boolean).sort()[0] as string | undefined;
  const firstYear = Math.max(Math.min(earliest ? +seasonOf(earliest).slice(0, 4) : +current.slice(0, 4), +season.slice(0, 4)), +current.slice(0, 4) - 9);
  const seasons: string[] = [];
  for (let y = +current.slice(0, 4); y >= firstYear; y--) seasons.push(`${y}-${String((y + 1) % 100).padStart(2, "0")}`);

  return {
    season,
    from: range.from,
    to: range.to,
    ranks,
    adventures,
    awards,
    totals: totals.get(scoutId) ?? null,
    events,
    photos,
    seasons,
  };
}
