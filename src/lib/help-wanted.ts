import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { adminConfigured, createAdminClient } from "./supabase/admin";
import { sendPushTo } from "./push";
import { easternDate } from "./tz";

// Help wanted: season jobs the pack needs filled (popcorn kernel, Blue and Gold chair...).
// Everyone sees the open ones and can say "I can help"; committee adds, edits and closes them
// and sees who offered (/help-wanted).

export interface OpenRole {
  id: string;
  title: string;
  description: string | null;
  contact_name: string | null;
  contact_title: string | null;
  sort_order: number;
  offered: boolean;
}

export interface PackRole {
  id: string;
  title: string;
  description: string | null;
  contact_adult_id: string | null;
  open: boolean;
  filled_by: string | null;
  sort_order: number;
  closed_at: string | null;
  filled: { first_name: string; preferred_name: string | null; last_name: string } | null;
  offers: {
    adult_id: string;
    note: string | null;
    created_at: string;
    adult: { first_name: string; preferred_name: string | null; last_name: string; family: { family_name: string } | null } | null;
  }[];
}

export interface VolunteerLoad {
  family_id: string | null;
  family_name: string;
  signups: number;
  people: string | null;
}

/** Open roles for the signed-in member (contact name and position only), in board order. */
export async function getOpenRolesForMe(): Promise<OpenRole[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("help_wanted_roles");
  return (data ?? []) as OpenRole[];
}

/** For committee: every role, open first, with who offered. */
export async function getAllRoles(): Promise<PackRole[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pack_roles")
    .select(
      "id, title, description, contact_adult_id, open, filled_by, sort_order, closed_at, filled:adults!pack_roles_filled_by_fkey(first_name, preferred_name, last_name), offers:role_interest(adult_id, note, created_at, adult:adults(first_name, preferred_name, last_name, family:families(family_name)))",
    )
    .order("open", { ascending: false })
    .order("sort_order")
    .order("created_at");
  return (data ?? []) as unknown as PackRole[];
}

/** Open roles for the Sunday email (secret-key client): titles and descriptions only. */
export async function getOpenRoles(db: SupabaseClient): Promise<{ title: string; description: string | null }[]> {
  const { data } = await db
    .from("pack_roles")
    .select("title, description")
    .eq("open", true)
    .order("sort_order")
    .order("created_at")
    .limit(10);
  return (data ?? []) as { title: string; description: string | null }[];
}

/** The pack year runs July 1 to June 30. The season holding `now`. */
export function currentSeason(now = Date.now()): { from: string; to: string; label: string } {
  const today = easternDate(now);
  const y = Number(today.slice(0, 4));
  const start = Number(today.slice(5, 7)) >= 7 ? y : y - 1;
  return { from: `${start}-07-01`, to: `${start + 1}-06-30`, label: `${start}–${String(start + 1).slice(2)}` };
}

/** Per family, volunteer job sign-ups this season (committee only; others get nothing). */
export async function getVolunteerLoad(): Promise<VolunteerLoad[]> {
  const { from, to } = currentSeason();
  const supabase = await createClient();
  const { data } = await supabase.rpc("volunteer_load", { p_from: from, p_to: to });
  return (data ?? []) as VolunteerLoad[];
}

/**
 * Someone said "I can help": a phone alert for the role's contact, or pack leadership
 * (committee, Cubmaster, admins) when the role has none. Best effort.
 */
export async function notifyRoleInterest(r: { roleId: string; who: string; adultId: string }) {
  try {
    if (!adminConfigured()) return;
    const db = createAdminClient();
    const { data: role } = await db.from("pack_roles").select("title, contact_adult_id").eq("id", r.roleId).maybeSingle();
    if (!role) return;
    let ids: string[] = [];
    if (role.contact_adult_id) {
      const { data } = await db.from("adults").select("id").eq("id", role.contact_adult_id).eq("is_active", true);
      ids = ((data ?? []) as { id: string }[]).map((a) => a.id);
    }
    if (!ids.length) {
      const { data } = await db.from("adults").select("id").in("role", ["committee", "cubmaster", "admin"]).eq("is_active", true);
      ids = ((data ?? []) as { id: string }[]).map((a) => a.id);
    }
    ids = ids.filter((id) => id !== r.adultId);
    if (!ids.length) return;
    await sendPushTo(ids, {
      title: "Someone can help",
      body: `${r.who} offered to help: ${String(role.title).slice(0, 100)}.`,
      url: "/help-wanted",
      tag: `role-${r.roleId}`,
    });
  } catch {
    // Best effort.
  }
}
