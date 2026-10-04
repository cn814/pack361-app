import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { requireMember } from "./data";
import { isAdmin } from "./advancement-data";
import type { Adult, AppRole, DenRank } from "./types";
import { getSettings, SETTING_DEFAULTS } from "./settings";
import type { JoinRequest } from "./join";
import { startOfTodayEastern } from "./email";

export const ROLE_LABEL: Record<AppRole, string> = {
  parent: "Parent",
  den_leader: "Den leader",
  committee: "Key leader",
  cubmaster: "Cubmaster",
  admin: "Pack admin",
};

export async function requireAdmin(): Promise<Adult> {
  const me = await requireMember();
  if (!isAdmin(me)) redirect("/leaders");
  return me;
}

export interface RosterAdult {
  id: string;
  family_id: string | null;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  email: string;
  phone: string | null;
  relationship: string | null;
  role: AppRole;
  position_title: string | null;
  bsa_member_id: string | null;
  is_active: boolean;
  user_id: string | null;
  welcomed_at: string | null;
}

export interface RosterScout {
  id: string;
  family_id: string;
  den_id: string | null;
  first_name: string;
  last_name: string;
  bsa_member_id: string | null;
  photo_permission: "yes" | "no" | null;
  is_active: boolean;
  den: { name: string } | null;
}

export interface RosterFamily {
  id: string;
  family_name: string;
  is_active: boolean;
  adults: RosterAdult[];
  scouts: RosterScout[];
}

export interface RosterDen {
  id: string;
  rank: DenRank;
  number: number;
  name: string;
  meeting_info: string | null;
  is_active: boolean;
}

const ADULT_COLS =
  "id, family_id, first_name, last_name, preferred_name, email, phone, relationship, role, position_title, bsa_member_id, is_active, user_id, welcomed_at";
const SCOUT_COLS = "id, family_id, den_id, first_name, last_name, bsa_member_id, photo_permission, is_active, den:dens(name)";

export async function getFamilies(): Promise<RosterFamily[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("families")
    .select(`id, family_name, is_active, adults(${ADULT_COLS}), scouts(${SCOUT_COLS})`)
    .order("family_name");
  return (data ?? []) as unknown as RosterFamily[];
}

export async function getFamily(id: string): Promise<RosterFamily | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("families")
    .select(`id, family_name, is_active, adults(${ADULT_COLS}), scouts(${SCOUT_COLS})`)
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as RosterFamily | null) ?? null;
}

export async function getAdultsWithoutFamily(): Promise<RosterAdult[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("adults").select(ADULT_COLS).is("family_id", null).order("last_name");
  return (data ?? []) as RosterAdult[];
}

export async function getAllAdults(): Promise<RosterAdult[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("adults").select(ADULT_COLS).order("last_name").order("first_name");
  return (data ?? []) as RosterAdult[];
}

export async function getAdult(id: string): Promise<RosterAdult | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("adults").select(ADULT_COLS).eq("id", id).maybeSingle();
  return (data as RosterAdult | null) ?? null;
}

export async function getDens(includeInactive = true): Promise<RosterDen[]> {
  const supabase = await createClient();
  let q = supabase.from("dens").select("id, rank, number, name, meeting_info, is_active");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data } = await q;
  const order = ["lion", "tiger", "wolf", "bear", "webelos", "aol"];
  return ((data ?? []) as RosterDen[]).sort((a, b) => order.indexOf(a.rank) - order.indexOf(b.rank) || a.number - b.number);
}

export interface DenLeaderRow {
  den_id: string;
  adult_id: string;
  title: string;
  adult: { first_name: string; last_name: string; preferred_name: string | null } | null;
}

export async function getDenLeaders(): Promise<DenLeaderRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("den_leaders")
    .select("den_id, adult_id, title, adult:adults(first_name, last_name, preferred_name)");
  return (data ?? []) as unknown as DenLeaderRow[];
}

/** Last sign-in per adult (admins only). */
export async function getSignIns(): Promise<Map<string, string | null>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("roster_sign_ins");
  return new Map(((data ?? []) as { adult_id: string; last_sign_in_at: string | null }[]).map((r) => [r.adult_id, r.last_sign_in_at]));
}

/** How many welcome emails can still go out today under the pack's daily limit. */
export async function welcomeBudget(): Promise<{ sentToday: number; limit: number; left: number }> {
  const supabase = await createClient();
  const settings = await getSettings();
  const limit = Number(settings.email_daily_limit || SETTING_DEFAULTS.email_daily_limit);
  const { count } = await supabase
    .from("adults")
    .select("id", { count: "exact", head: true })
    .gte("welcomed_at", startOfTodayEastern());
  const sentToday = count ?? 0;
  return { sentToday, limit, left: Math.max(0, limit - sentToday) };
}


// ---------------------------------------------------------------------------
// Ask to join
// ---------------------------------------------------------------------------
const JOIN_COLS = "id, email, first_name, last_name, phone, relationship, scouts, note, status, decline_reason, family_id, decided_at, created_at";

/** Waiting requests, oldest first, and the last few answered. Admins only (RLS). */
export async function getJoinRequests(): Promise<{ waiting: JoinRequest[]; recent: JoinRequest[] }> {
  const supabase = await createClient();
  const [w, r] = await Promise.all([
    supabase.from("join_requests").select(JOIN_COLS).eq("status", "pending").order("created_at"),
    supabase.from("join_requests").select(JOIN_COLS).neq("status", "pending").order("decided_at", { ascending: false }).limit(10),
  ]);
  return { waiting: (w.data ?? []) as JoinRequest[], recent: (r.data ?? []) as JoinRequest[] };
}

export async function countWaitingJoins(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("join_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
  return count ?? 0;
}
