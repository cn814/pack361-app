import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "./supabase/server";
import type { Adult, Announcement, AppRole, ItineraryItem, Leader, PackEvent, PackingItem, Scout } from "./types";
import { LEADER_ROLES, TWO_STEP_ROLES } from "./types";
import { VIEW_AS_COOKIE, viewAsRole } from "./view-as";
import { isBeta } from "./version";
import { getTesters } from "./beta";
import { denScopeFromScouts, loadCalendar, type CalItem, type DenScope } from "./calendar";
import { startOfEasternDay } from "./tz";
import { FEATURE_DAYS_AFTER, FEATURE_DAYS_BEFORE, featuredKind, type FeaturedTab } from "./featured";

/**
 * Two-step sign-in for every leader (den leaders, key leaders, the Cubmaster and admins):
 * "ok" = not needed, or the code was entered this session; "verify" = enter the code from the
 * authenticator app; "setup" = no authenticator app added yet.
 */
export type TwoStep = "ok" | "verify" | "setup";

export interface Me {
  email: string;
  adult: Adult | null;
  twoStep: TwoStep;
  /** The roster role, whatever "View as" or a missing two-step code shows. */
  role: AppRole | null;
}

/** The signed-in adult's roster row, or null if they're signed in but not on the roster. */
export const getMe = cache(async (): Promise<Me | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const sub = claims?.claims?.sub;
  if (!sub) return null;
  const { data } = await supabase
    .from("adults")
    .select("id, family_id, first_name, last_name, preferred_name, email, phone, role, position_title, ypt_expires_on, registration_expires_on")
    .eq("user_id", sub)
    .eq("is_active", true)
    .maybeSingle();
  let adult = (data as Adult | null) ?? null;
  const role = adult?.role ?? null;
  let twoStep: TwoStep = "ok";
  if (adult && needsTwoStep(adult.role) && claims?.claims?.aal !== "aal2") {
    // Until the code is entered, a leader gets a parent's access everywhere (the database
    // checks the same thing).
    const { data: factors } = await supabase.auth.mfa.listFactors();
    twoStep = factors?.totp?.length ? "verify" : "setup";
    adult = { ...adult, role: "parent" };
  } else if (adult) {
    // "View as": show a leader the app as a lower role. Display only; the database still checks
    // their real permissions.
    const view = viewAsRole(adult.role, (await cookies()).get(VIEW_AS_COOKIE)?.value);
    if (view) adult = { ...adult, role: view, real_role: adult.role };
  }
  return { email: String(claims?.claims?.email ?? ""), adult, twoStep, role };
});

/** Every leader signs in with an authenticator app as well as email. */
export function needsTwoStep(role: AppRole | null | undefined) {
  return !!role && TWO_STEP_ROLES.includes(role);
}

/** Use at the top of every member page: sends visitors to login and non-roster users to the help page. */
export async function requireMember(): Promise<Adult> {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!me.adult) redirect("/not-on-roster");
  if (me.twoStep !== "ok") redirect("/two-step");
  // The beta site is for the testers picked in Pack admin (and admins).
  if (isBeta() && !(await getTesters()).ids.has(me.adult.id)) redirect("/beta-only");
  return me.adult;
}

export function isLeader(a: Adult) {
  return LEADER_ROLES.includes(a.role);
}

/** Runs the gear closet: leaders, and the quartermaster (by pack position) even if a parent. */
export function isGearKeeper(a: Adult) {
  return isLeader(a) || /quartermaster/i.test(a.position_title ?? "");
}

/** Key leaders, the Cubmaster and admins (they keep the Pack guide up to date). */
export function isCommittee(a: Adult) {
  return a.role === "committee" || a.role === "cubmaster" || a.role === "admin";
}

export function displayName(a: { first_name: string; preferred_name?: string | null }) {
  return a.preferred_name || a.first_name;
}

/** The signed-in family's active scouts, read once per request (calendar, to-dos, forms and pages share it). */
export const getMyScouts = cache(async (): Promise<Scout[]> => {
  const me = await requireMember();
  if (!me.family_id) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("scouts")
    .select("id, first_name, last_name, family_id, photo_permission, social_ok, registration_expires_on, den:dens(id, rank, number, name)")
    .eq("family_id", me.family_id)
    .eq("is_active", true)
    .order("first_name");
  return (data ?? []) as unknown as Scout[];
});

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
 * `near` reads a shorter window (Home, to-dos, the bell): enough for the first 60 or so items.
 */
export async function getUpcomingEvents(limit = 50, opts: { mine?: boolean; near?: boolean } = {}): Promise<CalItem[]> {
  const me = await requireMember();
  const who = opts.mine || !isLeader(me) ? "family" : "all";
  // Everything today stays up all day; campouts stay up until they end.
  const today = Date.parse(startOfEasternDay());
  const items = await calendarWindow(who, opts.near && limit <= NEAR_LIMIT - 20 ? "near" : "full");
  return items.filter((e) => Date.parse(e.ends_at ?? e.starts_at) >= today).slice(0, limit);
}

/**
 * Start reading the full calendar now (a page that lists it), so the short reads in the same
 * request (the pinned big event, the bell's to-dos) reuse it instead of reading their own.
 * `who` must match what getUpcomingEvents works out for the page.
 */
export function preloadCalendar(who: "family" | "all") {
  void calendarWindow(who, "full").catch(() => {});
}

/** Items in the short window (it also covers the ten days back, so keep 20 spare). */
const NEAR_LIMIT = 80;
type Span = "near" | "full";

/** This request's calendar reads, so the short window can reuse a full one already started. */
const calendarWindows = cache(() => new Map<string, Promise<CalItem[]>>());

/**
 * The calendar from ten days ago on, read once per request and shared by Home, the to-dos,
 * the bell and the page. "family" = pack-wide plus the family's own dens (leaders too).
 * List pages never show an event's details, so they're left out here (the feed reads them).
 */
function calendarWindow(who: "family" | "all", span: Span): Promise<CalItem[]> {
  const windows = calendarWindows();
  const full = windows.get(`${who}:full`);
  if (full) return full;
  const key = `${who}:${span}`;
  let p = windows.get(key);
  if (!p) {
    p = (async () => {
      const supabase = await createClient();
      // Leaders' "all" is every den; a family's dens come from its scouts (read once per request).
      const scope: DenScope = who === "all" ? "all" : denScopeFromScouts(await getMyScouts());
      return loadCalendar(supabase, scope, {
        since: new Date(Date.now() - 10 * 86400000).toISOString(),
        limit: span === "near" ? NEAR_LIMIT : 300,
        details: false,
      });
    })();
    windows.set(key, p);
  }
  return p;
}

export async function getEvent(id: string): Promise<PackEvent | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, title, category, starts_at, ends_at, location_name, address, details, signup_url, den_id, ranks, only_scouts, all_day, leaders_only, twh_uid, twh_url, archived_at, archived_reason, rsvp_enabled, rsvp_by, fee_family_cents, fee_scout_cents, fee_adult_cents, source, links, sections, camping_nights, attendance_taken_at, public_on_join, public_blurb, slip_required, slip_text, slip_document_id, slip_due, carpool")
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
  const big = await getBigEvent();
  return big ? { href: big.event.href, label: big.label, kind: big.kind } : null;
});

/**
 * The pack's next big event (campout, derby, Blue & Gold, crossover…), pinned at the top of
 * Home and Calendar from 45 days before until 3 days after it.
 */
export const getBigEvent = cache(async (): Promise<{ event: CalItem; label: string; kind: FeaturedTab["kind"] } | null> => {
  const now = Date.now();
  // Pack-wide events plus this family's own dens and ranks (leaders included).
  const items = await calendarWindow("family", "near");
  for (const e of items) {
    if (e.kind !== "event" || new Date(e.starts_at).getTime() > now + FEATURE_DAYS_BEFORE * 86400000) continue;
    const k = featuredKind(e);
    if (!k) continue;
    const over = new Date(e.ends_at ?? e.starts_at).getTime() + FEATURE_DAYS_AFTER * 86400000;
    if (over < now) continue;
    return { event: e, label: k.label, kind: k.kind };
  }
  return null;
});
