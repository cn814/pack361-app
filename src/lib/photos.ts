import "server-only";
import { createClient } from "./supabase/server";

export const PHOTO_BUCKET = "pack-photos";

export interface Photo {
  id: string;
  uploader_id: string;
  storage_path: string;
  thumb_path: string | null;
  caption: string | null;
  event_id: string | null;
  status: "pending_review" | "approved" | "rejected";
  created_at: string;
  event: { id: string; title: string; starts_at: string; category: string } | null;
  thumb_url?: string | null;
  full_url?: string | null;
}

const COLS = "id, uploader_id, storage_path, thumb_path, caption, event_id, status, created_at, event:events(id, title, starts_at, category)";

/** Attach short-lived signed URLs (the bucket is private; RLS decides who can sign). */
async function sign(photos: Photo[], full = false): Promise<Photo[]> {
  if (!photos.length) return photos;
  const supabase = await createClient();
  const paths = photos.flatMap((p) => [p.thumb_path ?? p.storage_path, ...(full ? [p.storage_path] : [])]);
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls([...new Set(paths)], 60 * 60);
  const url = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return photos.map((p) => ({
    ...p,
    thumb_url: url.get(p.thumb_path ?? p.storage_path) ?? null,
    full_url: full ? (url.get(p.storage_path) ?? null) : null,
  }));
}

export interface Album {
  key: string; // event id or "other"
  title: string;
  date: string | null;
  count: number;
  latest: string;
  cover: Photo;
}

/** One album per event (plus "Around the pack"), newest event first. Counted in the database. */
export async function getAlbums(): Promise<Album[]> {
  const supabase = await createClient();
  const { data: albums } = await supabase.rpc("photo_albums");
  const rows = (albums ?? []) as { event_id: string | null; photo_count: number; cover_id: string; latest_at: string }[];
  if (!rows.length) return [];
  const { data } = await supabase.from("photos").select(COLS).in("id", rows.map((r) => r.cover_id));
  const covers = await sign((data ?? []) as unknown as Photo[]);
  const byId = new Map(covers.map((p) => [p.id, p]));
  return rows
    .filter((r) => byId.has(r.cover_id))
    .map((r) => {
      const cover = byId.get(r.cover_id)!;
      return {
        key: r.event_id ?? "other",
        title: cover.event?.title ?? "Around the pack",
        date: cover.event?.starts_at ?? null,
        latest: r.latest_at,
        count: Number(r.photo_count),
        cover,
      };
    })
    // Newest event first; "Around the pack" sorts by its newest photo.
    .sort((a, b) => Date.parse(b.date ?? b.latest) - Date.parse(a.date ?? a.latest));
}

export async function getAlbumPhotos(key: string): Promise<Photo[]> {
  const supabase = await createClient();
  let q = supabase.from("photos").select(COLS).eq("status", "approved");
  q = key === "other" ? q.is("event_id", null) : q.eq("event_id", key);
  const { data } = await q.order("created_at");
  return sign((data ?? []) as unknown as Photo[]);
}

export async function getPhoto(id: string): Promise<Photo | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("photos").select(COLS).eq("id", id).maybeSingle();
  if (!data) return null;
  return (await sign([data as unknown as Photo], true))[0];
}

/** Photos waiting for a leader: new uploads and ones someone asked to take down. */
export async function getPendingPhotos(): Promise<(Photo & { flags: { reason: string | null; created_at: string; resolved_at: string | null }[] })[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select(`${COLS}, flags:photo_flags(reason, created_at, resolved_at)`)
    .eq("status", "pending_review")
    .order("created_at");
  const rows = (data ?? []) as unknown as (Photo & { flags: { reason: string | null; created_at: string; resolved_at: string | null }[] })[];
  const signed = await sign(rows, true);
  return rows.map((r, i) => ({ ...r, thumb_url: signed[i].thumb_url, full_url: signed[i].full_url }));
}

export async function countPendingPhotos(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("photos").select("id", { count: "exact", head: true }).eq("status", "pending_review");
  return count ?? 0;
}

export async function countEventPhotos(eventId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("photos")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "approved");
  return count ?? 0;
}

/** My own uploads still waiting for review. */
export async function countMyPending(adultId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("photos")
    .select("id", { count: "exact", head: true })
    .eq("uploader_id", adultId)
    .eq("status", "pending_review");
  return count ?? 0;
}

/** Events from the last six months up to tomorrow, newest first (for tagging uploads). */
export async function getRecentEvents(): Promise<{ id: string; title: string; starts_at: string; category: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, title, starts_at, category")
    .gte("starts_at", new Date(Date.now() - 183 * 86400000).toISOString())
    .lte("starts_at", new Date(Date.now() + 86400000).toISOString())
    .order("starts_at", { ascending: false });
  return (data ?? []) as { id: string; title: string; starts_at: string; category: string }[];
}

/** One event's id, title and date (to tag uploads from an event page). */
export async function getEventBrief(id: string): Promise<{ id: string; title: string; starts_at: string; category: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("id, title, starts_at, category").eq("id", id).maybeSingle();
  return (data as { id: string; title: string; starts_at: string; category: string } | null) ?? null;
}
