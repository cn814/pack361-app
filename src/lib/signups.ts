import "server-only";
import type { SignupSummary } from "@/components/EventRow";
import { getCampaigns, getOrders, isPaid } from "./fundraising-data";

/** Per-event Givebutter headcount and whether the signed-in family is registered. */
export async function getSignupSummaries(familyId: string | null): Promise<Map<string, SignupSummary>> {
  const campaigns = (await getCampaigns()).filter((c) => c.event_id);
  const orders = await getOrders(campaigns.map((c) => c.id));
  const out = new Map<string, SignupSummary>();
  for (const c of campaigns) {
    const mine = orders.some((o) => o.campaign_id === c.id && isPaid(o) && familyId && o.family_id === familyId);
    out.set(c.event_id!, { families: c.families_registered, mine });
  }
  return out;
}
