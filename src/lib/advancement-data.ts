import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";
import { requireMember } from "./data";
import type { AdvancementRecord, CatalogAdventure } from "./advancement";
import type { Adult, DenRank, Scout } from "./types";
import type { ImportChanges } from "./import-changes";

export type SubmissionStatus = "submitted" | "approved" | "returned" | "recorded";

export interface Submission {
  id: string;
  scout_id: string;
  rank: DenRank | null;
  adventure: string;
  requirement: string;
  completed_on: string;
  notes: string | null;
  status: SubmissionStatus;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  scout?: { first_name: string; last_name: string; den: { name: string } | null } | null;
  submitter?: { first_name: string; last_name: string; preferred_name: string | null } | null;
  reviewer?: { first_name: string; last_name: string; preferred_name: string | null } | null;
}

export interface ScoutRecord extends AdvancementRecord {
  scout_id: string;
}

export interface ImportLog {
  id: string;
  imported_at: string;
  file_name: string | null;
  row_count: number;
  scout_count: number;
  unmatched: { member_id: string; name: string }[];
  /** What the import changed; null for imports before this was recorded. */
  changes: ImportChanges | null;
}

const SCOUT_COLS = "id, first_name, last_name, family_id, den:dens(id, rank, number, name)";
const RECORD_COLS = "scout_id, kind, rank, adventure, item, version, completed_on, approved, awarded, awarded_on";
const SUB_COLS =
  "id, scout_id, rank, adventure, requirement, completed_on, notes, status, review_note, created_at, reviewed_at, " +
  "scout:scouts(first_name, last_name, den:dens(name)), " +
  "submitter:adults!advancement_submissions_submitted_by_fkey(first_name, last_name, preferred_name), " +
  "reviewer:adults!advancement_submissions_reviewed_by_fkey(first_name, last_name, preferred_name)";

export const REVIEW_ALL_ROLES = ["committee", "cubmaster", "admin"] as const;

export function reviewsWholePack(me: Adult) {
  return (REVIEW_ALL_ROLES as readonly string[]).includes(me.role);
}

export function isAdmin(me: Adult) {
  return me.role === "admin" || me.role === "cubmaster";
}

export const getCatalog = cache(async (): Promise<CatalogAdventure[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("adventures")
    .select("rank, name, required, req_count, special, sort_order, home, home_idea, info_url")
    .order("sort_order");
  return (data ?? []) as CatalogAdventure[];
});

/** A scout the signed-in adult may see (own family, or any scout for leaders). */
export async function getScout(id: string): Promise<Scout | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("scouts").select(SCOUT_COLS).eq("id", id).maybeSingle();
  return (data as unknown as Scout | null) ?? null;
}

/** Dens this adult leads (empty for everyone else). */
export const getMyDenIds = cache(async (): Promise<string[]> => {
  const me = await requireMember();
  const supabase = await createClient();
  const { data } = await supabase.from("den_leaders").select("den_id").eq("adult_id", me.id);
  return (data ?? []).map((d) => d.den_id as string);
});

/** Scouts whose advancement this adult can review: their den(s), or the whole pack. */
export async function getReviewableScouts(): Promise<Scout[]> {
  const me = await requireMember();
  const whole = reviewsWholePack(me);
  const denIds = whole ? [] : await getMyDenIds();
  if (!whole && denIds.length === 0) return [];
  const supabase = await createClient();
  let q = supabase.from("scouts").select(SCOUT_COLS).eq("is_active", true);
  if (!whole) q = q.in("den_id", denIds);
  const { data } = await q.order("last_name").order("first_name");
  return (data ?? []) as unknown as Scout[];
}

export async function getRecords(scoutIds: string[]): Promise<ScoutRecord[]> {
  if (!scoutIds.length) return [];
  const supabase = await createClient();
  const out: ScoutRecord[] = [];
  // PostgREST caps a response at 1000 rows by default; page through.
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("scout_advancement")
      .select(RECORD_COLS)
      .in("scout_id", scoutIds)
      .order("id")
      .range(from, from + 999);
    out.push(...((data ?? []) as ScoutRecord[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function getSubmissions(filter: { scoutId?: string; status?: SubmissionStatus[] }): Promise<Submission[]> {
  const supabase = await createClient();
  let q = supabase.from("advancement_submissions").select(SUB_COLS);
  if (filter.scoutId) q = q.eq("scout_id", filter.scoutId);
  if (filter.status) q = q.in("status", filter.status);
  const { data } = await q.order("created_at", { ascending: false }).limit(300);
  return (data ?? []) as unknown as Submission[];
}

/**
 * Scoutbook shows approved-but-not-awarded items: the patches and pins to buy.
 * Items finished before the pack's "awards tracked from" date count as already handed out.
 */
export async function getAwardsToHandOut(scoutIds: string[], since: string): Promise<ScoutRecord[]> {
  if (!scoutIds.length) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("scout_advancement")
    .select(RECORD_COLS)
    .in("scout_id", scoutIds)
    .in("kind", ["adventure", "rank", "award"])
    .eq("approved", true)
    .eq("awarded", false)
    .gte("completed_on", since)
    .order("completed_on")
    .limit(2000);
  return (data ?? []) as ScoutRecord[];
}

export async function getLastImport(): Promise<ImportLog | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("advancement_imports")
    .select("id, imported_at, file_name, row_count, scout_count, unmatched, changes")
    .order("imported_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ImportLog | null) ?? null;
}

/** When this scout's Scoutbook data was last loaded. */
export async function getDataAsOf(scoutIds: string[]): Promise<string | null> {
  if (!scoutIds.length) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("scout_advancement")
    .select("imported_at")
    .in("scout_id", scoutIds)
    .order("imported_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.imported_at as string | undefined) ?? null;
}
