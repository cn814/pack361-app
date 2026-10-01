import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { CHARGE_COLUMNS, eventCost, type ChargeRow, type EventFees } from "./money";
import { easternDate } from "./tz";
import type { SettingKey } from "./settings";

// Leaders' Money page (committee only; Row Level Security hides everyone else's money anyway).

export interface LeaderCharge extends ChargeRow {
  paypal_capture_id: string | null;
  event: ({ title: string } & EventFees) | null;
}

export const LEADER_CHARGE_COLUMNS = `${CHARGE_COLUMNS}, paypal_capture_id, event:events(title, fee_family_cents, fee_scout_cents, fee_adult_cents)`;

/** Every charge (Supabase returns at most 1,000 rows a request, so read in pages). */
export async function getAllCharges(supabase?: SupabaseClient): Promise<LeaderCharge[]> {
  const db = supabase ?? (await createClient());
  const out: LeaderCharge[] = [];
  for (let page = 0; page < 20; page++) {
    const { data, error } = await db
      .from("charges")
      .select(LEADER_CHARGE_COLUMNS)
      .order("created_at", { ascending: false })
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as unknown as LeaderCharge[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Today in Eastern time (YYYY-MM-DD). */
export const todayEastern = () => easternDate(Date.now());

/** An instant `days` days ago, as ISO. */
export const daysAgoIso = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

/** July 1 to June 30 for a season like "2026-27". */
export function seasonWindow(season: string): { from: string; to: string } | null {
  const m = /^(\d{4})-\d{2}$/.exec(season);
  if (!m) return null;
  const y = Number(m[1]);
  return { from: `${y}-07-01`, to: `${y + 1}-06-30` };
}

/** Does this charge belong to the current season (dues season, registration year, or dated in it)? */
export function inSeason(c: ChargeRow, settings: Record<SettingKey, string>): boolean {
  if (c.season) return c.season === settings.dues_season || (Boolean(settings.registration_year) && c.season === settings.registration_year);
  const w = seasonWindow(settings.dues_season);
  if (!w) return true;
  const d = c.due_on ?? easternDate(c.created_at);
  return d >= w.from && d <= w.to;
}

export interface MoneySummary {
  owed: number;
  owedCount: number;
  reported: number;
  reportedCount: number;
  paid: number;
  paidCount: number;
  online: number;
  offline: number;
  waivedCount: number;
}

export function summarize(charges: ChargeRow[]): MoneySummary {
  const s: MoneySummary = { owed: 0, owedCount: 0, reported: 0, reportedCount: 0, paid: 0, paidCount: 0, online: 0, offline: 0, waivedCount: 0 };
  for (const c of charges) {
    if (c.status === "open") {
      s.owed += c.amount_cents;
      s.owedCount++;
    } else if (c.status === "reported") {
      s.reported += c.amount_cents;
      s.reportedCount++;
    } else if (c.status === "paid") {
      const amt = c.paid_amount_cents ?? c.amount_cents;
      s.paid += amt;
      s.paidCount++;
      if (c.paid_via === "paypal" || c.paid_via === "givebutter") s.online += amt;
      else s.offline += amt;
    } else if (c.status === "waived") s.waivedCount++;
  }
  return s;
}

export interface RsvpTotal {
  status: string;
  scouts: number;
  adults: number;
}

/** Current RSVPs for these events, keyed "event:family" or "event:a:adult" (adults with no family). */
export async function getRsvpTotals(eventIds: string[]): Promise<Map<string, RsvpTotal>> {
  const map = new Map<string, RsvpTotal>();
  if (!eventIds.length) return map;
  const supabase = await createClient();
  for (let i = 0; i < eventIds.length; i += 100) {
    const { data } = await supabase
      .from("event_rsvps")
      .select("event_id, family_id, adult_id, status, scouts, adults")
      .in("event_id", eventIds.slice(i, i + 100));
    for (const r of data ?? []) {
      const key = r.family_id ? `${r.event_id}:${r.family_id}` : `${r.event_id}:a:${r.adult_id}`;
      map.set(key, { status: r.status as string, scouts: r.scouts as number, adults: r.adults as number });
    }
  }
  return map;
}

/**
 * For a paid (or reported) event charge: what the family's RSVP adds up to now, when it differs
 * from what they paid. null = no difference (or nothing to compare).
 */
export function rsvpMismatch(c: LeaderCharge, rsvps: Map<string, RsvpTotal>): number | null {
  if (c.kind !== "event" || !c.event_id || !c.event || (c.status !== "paid" && c.status !== "reported")) return null;
  if (c.scout_id || (c.family_id && c.adult_id)) return null; // a per-person fee a leader added, not the RSVP's
  const key = c.family_id ? `${c.event_id}:${c.family_id}` : `${c.event_id}:a:${c.adult_id}`;
  const r = rsvps.get(key);
  if (!r) return null; // added by a leader, not from an RSVP
  const now = r.status === "yes" ? eventCost(c.event, r.scouts, r.adults) : 0;
  const had = c.status === "paid" ? (c.paid_amount_cents ?? c.amount_cents) : c.amount_cents;
  return now !== had ? now : null;
}

/** Dues moved from the old dues list with no amount ($0): a leader needs to check them. */
export const MIGRATED_NOTE = "Moved from the old dues list; check the amount.";

export interface ProblemPayment {
  id: string;
  amount_cents: number;
  status: string;
  error: string | null;
  created_at: string;
  provider_order_id: string;
  provider_capture_id: string | null;
  family: { family_name: string } | null;
  adult: { first_name: string; preferred_name: string | null; last_name: string } | null;
}

/** Online payments that need a leader to look (amount didn't match, or something was paid twice). */
export async function getPaymentProblems(): Promise<ProblemPayment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payments")
    .select("id, amount_cents, status, error, created_at, provider_order_id, provider_capture_id, family:families(family_name), adult:adults(first_name, preferred_name, last_name)")
    .eq("status", "captured")
    .not("error", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []) as unknown as ProblemPayment[];
}

export type DuesMatch = "matched" | "partial" | "needs_review" | "not_dues";

export interface DuesOrder {
  id: number;
  name: string | null;
  amount: number | null;
  status: string | null;
  created_at: string | null;
  family_id: string | null;
  matched_scout_ids: string[];
  dues_match: DuesMatch | null;
  dues_note: string | null;
  dues_applied_at: string | null;
}

export interface DuesCampaign {
  id: number;
  title: string;
  url: string | null;
}

/** Synced Givebutter campaigns, newest first (for picking the dues campaign). */
export async function getGivebutterCampaigns(): Promise<DuesCampaign[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("givebutter_campaigns").select("id, title, url").order("id", { ascending: false });
  return (data ?? []) as DuesCampaign[];
}

/** The dues campaign picked in Settings, if it has been synced. */
export async function getDuesCampaign(id: string): Promise<DuesCampaign | null> {
  if (!/^\d{1,18}$/.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("givebutter_campaigns").select("id, title, url").eq("id", Number(id)).maybeSingle();
  return (data as DuesCampaign | null) ?? null;
}

/** Orders in the dues campaign, newest first. */
export async function getDuesOrders(campaignId: number): Promise<DuesOrder[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("givebutter_orders")
    .select("id, name, amount, status, created_at, family_id, matched_scout_ids, dues_match, dues_note, dues_applied_at")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(500);
  return (data ?? []) as DuesOrder[];
}
