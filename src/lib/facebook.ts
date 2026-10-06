import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";
import type { PhotoSocialStatus } from "./photo-permission";
import { RANKS } from "./advancement";

// Photos on the pack's public Facebook page (supabase/migrations/20261019000000_facebook_photos.sql).
// Leaders, and anyone a pack admin adds under Pack admin → Report access (the social media
// coordinator), see each family's answer and mark who's in a photo. The database checks who.

/** May this person see Facebook answers and mark who's in photos? */
export const getSocialAccess = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("social_access");
  return !error && data === true;
});

export interface SocialScout {
  scout_id: string;
  /** First name and last initial. */
  name: string;
  den: string | null;
  rank: string | null;
  social_ok: boolean;
  answered: boolean;
}

/** Every active scout and their family's Facebook answer (empty without access). */
export const getSocialScouts = cache(async (): Promise<SocialScout[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("social_scouts");
  const order = (s: SocialScout) => (s.rank ? RANKS.indexOf(s.rank as (typeof RANKS)[number]) : 99);
  return ((data ?? []) as SocialScout[]).sort(
    (a, b) => order(a) - order(b) || (a.den ?? "~").localeCompare(b.den ?? "~") || a.name.localeCompare(b.name),
  );
});

/** Facebook status of these photos, or of every approved photo (empty without access). */
export async function getPhotoSocialStatus(ids?: string[]): Promise<Map<string, PhotoSocialStatus>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("photo_social_status", ids ? { p_photo_ids: ids } : {});
  return new Map(((data ?? []) as PhotoSocialStatus[]).map((s) => [s.photo_id, s]));
}

/** The scouts marked as in this photo. */
export async function getPhotoPeople(photoId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("photo_people").select("scout_id").eq("photo_id", photoId);
  return ((data ?? []) as { scout_id: string }[]).map((r) => r.scout_id);
}

/** Scouts grouped by den, keeping the order they come in (getSocialScouts: Lions first). */
export function byDen<T extends { den: string | null }>(list: T[]): { den: string; scouts: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const s of list) {
    const k = s.den ?? "No den";
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups.entries()].map(([den, scouts]) => ({ den, scouts }));
}
