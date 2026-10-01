import "server-only";
import { createClient } from "./supabase/server";
import type { DenRank, PackEvent } from "./types";
import { eventIsFor } from "./slips";

export { DEFAULT_SLIP_TEXT, eventIsFor, slipOpen } from "./slips";

export interface Slip {
  id: string;
  scout_id: string;
  kind: "signed" | "paper";
  signed_name: string | null;
  signed_text: string | null;
  contact: string | null;
  created_at: string;
  signer: { first_name: string; preferred_name: string | null; last_name: string } | null;
  recorder: { first_name: string; preferred_name: string | null; last_name: string } | null;
}

export interface SlipScout {
  id: string;
  first_name: string;
  last_name: string;
  family_id: string;
  den: { id: string; rank: DenRank; name: string } | null;
}

const SLIP_COLS =
  "id, scout_id, kind, signed_name, signed_text, contact, created_at, signer:adults!permission_slips_signed_by_fkey(first_name, preferred_name, last_name), recorder:adults!permission_slips_recorded_by_fkey(first_name, preferred_name, last_name)";

export async function getSlips(eventId: string): Promise<Slip[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("permission_slips").select(SLIP_COLS).eq("event_id", eventId).order("created_at");
  return (data ?? []) as unknown as Slip[];
}

/** The family's scouts the event is for, with their slips. */
export async function getFamilySlips(e: PackEvent, familyId: string | null): Promise<{ scout: SlipScout; slip: Slip | null }[]> {
  if (!familyId) return [];
  const supabase = await createClient();
  const [{ data }, slips] = await Promise.all([
    supabase
      .from("scouts")
      .select("id, first_name, last_name, family_id, den:dens(id, rank, name)")
      .eq("family_id", familyId)
      .eq("is_active", true)
      .order("first_name"),
    getSlips(e.id),
  ]);
  const scouts = ((data ?? []) as unknown as SlipScout[]).filter((s) => eventIsFor(e, s) || slips.some((x) => x.scout_id === s.id));
  return scouts.map((scout) => ({ scout, slip: slips.find((x) => x.scout_id === scout.id) ?? null }));
}

export interface LeaderSlipRow {
  scout: SlipScout;
  slip: Slip | null;
  /** Their family said they're going. */
  going: boolean;
}

/** Leaders: every scout the event is for, going families first, with their slips. */
export async function getLeaderSlips(e: PackEvent): Promise<LeaderSlipRow[]> {
  const supabase = await createClient();
  const [{ data }, slips, { data: rsvps }] = await Promise.all([
    supabase.from("scouts").select("id, first_name, last_name, family_id, den:dens(id, rank, name)").eq("is_active", true),
    getSlips(e.id),
    supabase.from("event_rsvps").select("family_id").eq("event_id", e.id).eq("status", "yes").not("family_id", "is", null),
  ]);
  const going = new Set((rsvps ?? []).map((r) => r.family_id as string));
  const scouts = ((data ?? []) as unknown as SlipScout[]).filter((s) => eventIsFor(e, s) || slips.some((x) => x.scout_id === s.id));
  return scouts
    .map((scout) => ({ scout, slip: slips.find((x) => x.scout_id === scout.id) ?? null, going: going.has(scout.family_id) }))
    .sort(
      (a, b) =>
        Number(b.going) - Number(a.going) ||
        (a.scout.den?.name ?? "~").localeCompare(b.scout.den?.name ?? "~") ||
        a.scout.first_name.localeCompare(b.scout.first_name),
    );
}
