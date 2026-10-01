import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Adult, Announcement, ItineraryItem, Leader, PackEvent, PackingItem, Scout } from "./types";
import { LEADER_ROLES } from "./types";
import { denScopeFor, loadCalendar, type CalItem } from "./calendar";
import { startOfEasternDay } from "./tz";
import { FEATURE_DAYS_AFTER, FEATURE_DAYS_BEFORE, featuredKind, type FeaturedTab } from "./featured";

/** The signed-in adult's roster row, or null if they're signed in but not on the roster. */
export const getMe = cache(async (): Promise<{ email: string; adult: Adult | null } | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const sub = claims?.claims?.sub;
  if (!sub) return null;
  const { data } = await supabase
    .from("adults")
    .select("id, family_id, first_name, last_name, preferred_name, email, phone, role, position_title, ypt_expires_on")
    .eq("user_id", sub)
    .eq("is_active", true)
    .maybeSingle();
  return { email: String(claims?.claims?.email ?? ""), adult: (data as Adult | null) ?? null };
});

/** Use at the top of every member page: sends visitors to login and non-roster users to the help page. */
export async function requireMember(): Promise<Adult> {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!me.adult) redirect("/not-on-roster");
  return me.adult;
}

export function isLeader(a: Adult) {
  return LEADER_ROLES.includes(a.role);
}

/** Committee members, the Cubmaster and admins (they keep the Pack guide up to date). */
export function isCommittee(a: Adult) {
  return a.role === "committee" || a.role === "cubmaster" || a.role === "admin";
}

export function displayName(a: { first_name: string; preferred_name?: string | null }) {
  return a.preferred_name || a.first_name;
}

export async function getMyScouts(): Promise<Scout[]> {
  const me = await requireMember();
  if (!me.family_id) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("scouts")
    .select("id, first_name, last_name, family_id, photo_permission, den:dens(id, rank, number, name)")
    .eq("family_id", me.family_id)
    .eq("is_active", true)
    .order("first_name");
  return (data ?? []) as unknown as Scout[];
}

export async function getFamilyAdults(): Promise<Adult[]> {
  const me = await requireMember();
  if (!me.family_id) return [me];
  const supabase = await createClient();
  const { data } = await supabase
    .from("adults")
    .select("id, family_id, first_name, last_name, preferred_name, email, phone, role, position_title, ypt_expires_on")
    .eq("family_id", me.family_id)
    .order("first_name");
  return (data ?? []) as Adult[];
}

/**
 * Upcoming calendar for the signed-in adult: pack-wide events plus events and den meetings
 * for their scouts' dens. Leaders see every den, unless `mine` asks for just their family's.
 */
export async function getUpcomingEvents(limit = 50, opts: { mine?: boolean } = {}): Promise<CalItem[]> {
  const me = await requireMember();
  const who = opts.mine || !isLeader(me) ? "family" : "all";
  // Everything today stays up all day; campouts stay up until they end.
  const today = Date.parse(startOfEasternDay());
  return (await calendarWindow(who)).filter((e) => Date.parse(e.ends_at ?? e.starts_at) >= today).slice(0, limit);
}

/**
 * The calendar from ten days ago on, read once per request and shared by the bottom bar's
 * featured tab and the page. "family" = pack-wide plus the family's own dens (leaders too).
 */
const calendarWindow = cache(async (who: "family" | "all"): Promise<CalItem[]> => {
  const me = await requireMember();
  const supabase = await createClient();
  const scope = await denScopeFor(supabase, who === "family" ? { ...me, role: "parent" } : me);
  return loadCalendar(supabase, scope, { since: new Date(Date.now() - 10 * 86400000).toISOString(), limit: 300 });
});

export async function getEvent(id: string): Promise<PackEvent | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, title, category, starts_at, ends_at, location_name, address, details, signup_url, den_id, ranks, all_day, leaders_only, twh_uid, twh_url, archived_at, archived_reason, rsvp_enabled, rsvp_by, fee_family_cents, fee_scout_cents, fee_adult_cents, source, links, sections")
    .eq("id", id)
    .maybeSingle();
  return (data as PackEvent | null) ?? null;
}

export async function getItinerary(eventId: string): Promise<ItineraryItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("itinerary_items")
    .select("id, starts_at, title, location, notes")
    .eq("event_id", eventId)
    .order("starts_at");
  return (data ?? []) as ItineraryItem[];
}

/** Event-specific packing list, falling back to the pack's default campout list. */
export async function getPackingList(eventId: string): Promise<PackingItem[]> {
  const supabase = await createClient();
  const cols = "id, category, label, detail, required, sort_order";
  const { data: own } = await supabase.from("packing_items").select(cols).eq("event_id", eventId).order("sort_order");
  if (own && own.length) return own as PackingItem[];
  const { data } = await supabase.from("packing_items").select(cols).is("event_id", null).order("sort_order");
  return (data ?? []) as PackingItem[];
}

export async function getAnnouncements(limit = 20): Promise<Announcement[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("announcements")
    .select(
      "id, title, body, category, is_pinned, created_at, author_id, den_id, den:dens(name), author:adults!announcements_author_id_fkey(first_name, last_name, preferred_name, position_title)",
    )
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as Announcement[];
}

export async function getLeaders(): Promise<Leader[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("leader_directory");
  return (data ?? []) as Leader[];
}

/** The signed-in adult's private calendar feed token. */
export async function getCalendarToken(): Promise<string | null> {
  const me = await requireMember();
  const supabase = await createClient();
  const { data } = await supabase.from("adults").select("calendar_token").eq("id", me.id).maybeSingle();
  return (data?.calendar_token as string | undefined) ?? null;
}

/**
 * The next big event (campout, derby, Blue & Gold...) within its tab window, for the
 * bottom bar. Null when nothing big is coming up.
 */
export const getFeaturedTab = cache(async (): Promise<FeaturedTab | null> => {
  const now = Date.now();
  // Pack-wide events plus this family's own dens and ranks (leaders included).
  const items = await calendarWindow("family");
  for (const e of items) {
    if (e.kind !== "event" || new Date(e.starts_at).getTime() > now + FEATURE_DAYS_BEFORE * 86400000) continue;
    const k = featuredKind(e);
    if (!k) continue;
    const over = new Date(e.ends_at ?? e.starts_at).getTime() + FEATURE_DAYS_AFTER * 86400000;
    if (over < now) continue;
    return { href: e.href, label: k.label, kind: k.kind };
  }
  return null;
});
