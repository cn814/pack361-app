import "server-only";
import type { SignupSummary } from "@/components/EventRow";
import { createClient } from "./supabase/server";
import { isPaid } from "./fundraising-data";

/**
 * Per-event Givebutter headcount and whether the signed-in family is registered. Reads only the
 * columns it needs: event campaigns, and this family's own orders (not everyone's), at once.
 */
export async function getSignupSummaries(familyId: string | null): Promise<Map<string, SignupSummary>> {
  const supabase = await createClient();
  const [{ data: campaigns }, { data: orders }] = await Promise.all([
    supabase.from("givebutter_campaigns").select("id, event_id, families_registered").not("event_id", "is", null).order("id", { ascending: false }),
    familyId
      ? supabase.from("givebutter_orders").select("campaign_id, status").eq("family_id", familyId).limit(2000)
      : Promise.resolve({ data: [] }),
  ]);
  const paid = new Set(
    ((orders ?? []) as { campaign_id: number; status: string | null }[]).filter((o) => isPaid(o)).map((o) => o.campaign_id),
  );
  const out = new Map<string, SignupSummary>();
  for (const c of (campaigns ?? []) as { id: number; event_id: string; families_registered: number }[]) {
    out.set(c.event_id, { families: c.families_registered, mine: paid.has(c.id) });
  }
  return out;
}
