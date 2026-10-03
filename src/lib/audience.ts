import "server-only";
import { createClient } from "./supabase/server";
import { adminConfigured, createAdminClient } from "./supabase/admin";
import { isCommittee } from "./data";
import type { Adult } from "./types";

/** Dens this person may message or poll: every den for committee members, else the dens they lead. */
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

/** How many families (or single adults) answered yes and maybe for an event. */
export async function eventRsvpCounts(eventId: string): Promise<{ yes: number; maybe: number }> {
  if (!adminConfigured()) return { yes: 0, maybe: 0 };
  const { data } = await createAdminClient().from("event_rsvps").select("status").eq("event_id", eventId).in("status", ["yes", "maybe"]);
  const rows = (data ?? []) as { status: string }[];
  return { yes: rows.filter((r) => r.status === "yes").length, maybe: rows.filter((r) => r.status === "maybe").length };
}

/**
 * The adults an event message goes to: every active adult in a family that answered yes (and
 * maybe, if asked) to the event's RSVP, plus adults who answered for themselves.
 */
export async function eventAudience(eventId: string, withMaybe: boolean): Promise<Recipient[]> {
  if (!adminConfigured()) return [];
  const db = createAdminClient();
  const { data: rsvps } = await db
    .from("event_rsvps")
    .select("family_id, adult_id")
    .eq("event_id", eventId)
    .in("status", withMaybe ? ["yes", "maybe"] : ["yes"]);
  const families = [...new Set((rsvps ?? []).map((r) => r.family_id as string | null).filter(Boolean))] as string[];
  const solo = [...new Set((rsvps ?? []).filter((r) => !r.family_id).map((r) => r.adult_id as string | null).filter(Boolean))] as string[];
  const cols = "id, email, first_name, preferred_name";
  const [{ data: parents }, { data: adults }] = await Promise.all([
    families.length ? db.from("adults").select(cols).in("family_id", families).eq("is_active", true) : Promise.resolve({ data: [] }),
    solo.length ? db.from("adults").select(cols).in("id", solo).eq("is_active", true) : Promise.resolve({ data: [] }),
  ]);
  const byId = new Map<string, Recipient>();
  for (const a of [...(parents ?? []), ...(adults ?? [])] as Recipient[]) byId.set(a.id, a);
  return [...byId.values()];
}
