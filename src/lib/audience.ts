import "server-only";
import { createClient } from "./supabase/server";
import { adminConfigured, createAdminClient } from "./supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isCommittee } from "./data";
import { LEADER_ROLES, type Adult, type DenRank } from "./types";

/** Dens this person may message or poll: every den for pack leadership, else the dens they lead. */
export async function getMessageableDens(me: Adult): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const order = ["lion", "tiger", "wolf", "bear", "webelos", "aol"];
  let q = supabase.from("dens").select("id, name, rank, number").eq("is_active", true);
  if (!isCommittee(me)) {
    const { data: mine } = await supabase.from("den_leaders").select("den_id").eq("adult_id", me.id);
    const ids = (mine ?? []).map((d) => d.den_id as string);
    if (!ids.length) return [];
    q = q.in("id", ids);
  }
  const { data } = await q;
  return ((data ?? []) as { id: string; name: string; rank: string; number: number }[])
    .sort((a, b) => order.indexOf(a.rank) - order.indexOf(b.rank) || a.number - b.number)
    .map((d) => ({ id: d.id, name: d.name }));
}

export interface Recipient {
  id: string;
  email: string;
  first_name: string;
  preferred_name: string | null;
}

/**
 * The adults a den message goes to: every active adult in a family with an active scout in
 * the den, plus the den's leaders. Uses the secret key (parents can't list other families).
 */
export async function denAudience(denId: string): Promise<Recipient[]> {
  if (!adminConfigured()) return [];
  const db = createAdminClient();
  const [{ data: scouts }, { data: leaders }] = await Promise.all([
    db.from("scouts").select("family_id").eq("den_id", denId).eq("is_active", true),
    db.from("den_leaders").select("adult_id").eq("den_id", denId),
  ]);
  const families = [...new Set((scouts ?? []).map((s) => s.family_id as string).filter(Boolean))];
  const leaderIds = (leaders ?? []).map((l) => l.adult_id as string);
  const cols = "id, email, first_name, preferred_name";
  const [{ data: parents }, { data: leadAdults }] = await Promise.all([
    families.length
      ? db.from("adults").select(cols).in("family_id", families).eq("is_active", true)
      : Promise.resolve({ data: [] }),
    leaderIds.length ? db.from("adults").select(cols).in("id", leaderIds).eq("is_active", true) : Promise.resolve({ data: [] }),
  ]);
  const byId = new Map<string, Recipient>();
  for (const a of [...(parents ?? []), ...(leadAdults ?? [])] as Recipient[]) byId.set(a.id, a);
  return [...byId.values()];
}

/** Who an event message goes to. */
export type EventAudience = "going" | "going_maybe" | "no_answer";
export const EVENT_AUDIENCES: EventAudience[] = ["going", "going_maybe", "no_answer"];

export interface EventAudienceCounts {
  /** Families (or single adults) going (not waitlisted). */
  yes: number;
  maybe: number;
  /** Said yes while it was full. */
  waitlist: number;
  /** Families the event is for who haven't answered yet. */
  noAnswer: number;
}

type AudienceEvent = { id: string; den_id: string | null; ranks?: DenRank[] | null; leaders_only?: boolean | null };

/**
 * Families the event is for: every active family for a pack-wide event, or those with an active
 * scout in the event's den or ranks. Leader-only events are for leaders (as single adults:
 * "a:<adult id>", or their family). Returns family ids and solo adult ids.
 */
async function invitedFor(db: SupabaseClient, e: AudienceEvent): Promise<{ families: string[]; adults: { id: string; family_id: string | null }[] }> {
  if (e.leaders_only) {
    const { data } = await db.from("adults").select("id, family_id").in("role", LEADER_ROLES).eq("is_active", true);
    return { families: [], adults: (data ?? []) as { id: string; family_id: string | null }[] };
  }
  if (!e.den_id && !e.ranks?.length) {
    const { data } = await db.from("families").select("id").eq("is_active", true);
    return { families: (data ?? []).map((f) => f.id as string), adults: [] };
  }
  const { data } = await db.from("scouts").select("family_id, den:dens(id, rank)").eq("is_active", true);
  const families = ((data ?? []) as unknown as { family_id: string | null; den: { id: string; rank: DenRank } | null }[])
    .filter((s) => s.family_id && (e.den_id ? s.den?.id === e.den_id : Boolean(s.den && e.ranks?.includes(s.den.rank))))
    .map((s) => s.family_id as string);
  return { families: [...new Set(families)], adults: [] };
}

/** Families (and leaders, for leader-only events) the event is for who haven't answered. */
async function noAnswer(db: SupabaseClient, e: AudienceEvent): Promise<{ families: string[]; adults: string[] }> {
  const [invited, { data: rsvps }] = await Promise.all([
    invitedFor(db, e),
    db.from("event_rsvps").select("family_id, adult_id").eq("event_id", e.id),
  ]);
  const answeredFam = new Set((rsvps ?? []).map((r) => r.family_id as string | null).filter(Boolean));
  const answeredSolo = new Set((rsvps ?? []).filter((r) => !r.family_id).map((r) => r.adult_id as string));
  return {
    families: invited.families.filter((f) => !answeredFam.has(f)),
    adults: invited.adults
      .filter((a) => (a.family_id ? !answeredFam.has(a.family_id) : !answeredSolo.has(a.id)))
      .map((a) => a.id),
  };
}

async function audienceEvent(db: SupabaseClient, eventId: string): Promise<AudienceEvent | null> {
  const { data } = await db.from("events").select("id, den_id, ranks, leaders_only").eq("id", eventId).maybeSingle();
  return (data as AudienceEvent | null) ?? null;
}

/** How many families answered yes (in, and waitlisted) and maybe, and how many haven't answered. */
export async function eventRsvpCounts(eventId: string): Promise<EventAudienceCounts> {
  if (!adminConfigured()) return { yes: 0, maybe: 0, waitlist: 0, noAnswer: 0 };
  const db = createAdminClient();
  const [{ data }, e] = await Promise.all([
    db.from("event_rsvps").select("status, waitlisted").eq("event_id", eventId).in("status", ["yes", "maybe"]),
    audienceEvent(db, eventId),
  ]);
  const rows = (data ?? []) as { status: string; waitlisted: boolean | null }[];
  const none = e ? await noAnswer(db, e) : { families: [], adults: [] };
  return {
    yes: rows.filter((r) => r.status === "yes" && !r.waitlisted).length,
    maybe: rows.filter((r) => r.status === "maybe").length,
    waitlist: rows.filter((r) => r.status === "yes" && r.waitlisted).length,
    noAnswer: none.families.length + none.adults.length,
  };
}

/**
 * The adults an event message goes to: every active adult in the chosen families, plus adults
 * who answered for themselves.
 *  - going: families who said yes and are in (not waitlisted)
 *  - going_maybe: everyone who said yes (the waitlist too) or maybe
 *  - no_answer: families the event is for who haven't answered yet
 * `true`/`false` still work (Going + maybe / Going) for older callers.
 */
export async function eventAudience(eventId: string, audience: EventAudience | boolean): Promise<Recipient[]> {
  if (!adminConfigured()) return [];
  const mode: EventAudience = audience === true ? "going_maybe" : audience === false ? "going" : audience;
  const db = createAdminClient();
  let families: string[];
  let solo: string[];
  if (mode === "no_answer") {
    const e = await audienceEvent(db, eventId);
    if (!e) return [];
    ({ families, adults: solo } = await noAnswer(db, e));
  } else {
    let q = db.from("event_rsvps").select("family_id, adult_id").eq("event_id", eventId).in("status", mode === "going_maybe" ? ["yes", "maybe"] : ["yes"]);
    if (mode === "going") q = q.eq("waitlisted", false);
    const { data: rsvps } = await q;
    families = [...new Set((rsvps ?? []).map((r) => r.family_id as string | null).filter(Boolean))] as string[];
    solo = [...new Set((rsvps ?? []).filter((r) => !r.family_id).map((r) => r.adult_id as string | null).filter(Boolean))] as string[];
  }
  const cols = "id, email, first_name, preferred_name";
  const [{ data: parents }, { data: adults }] = await Promise.all([
    families.length ? db.from("adults").select(cols).in("family_id", families).eq("is_active", true) : Promise.resolve({ data: [] }),
    solo.length ? db.from("adults").select(cols).in("id", solo).eq("is_active", true) : Promise.resolve({ data: [] }),
  ]);
  const byId = new Map<string, Recipient>();
  for (const a of [...(parents ?? []), ...(adults ?? [])] as Recipient[]) byId.set(a.id, a);
  return [...byId.values()];
}
