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
