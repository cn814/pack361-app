import "server-only";
import { createClient } from "./supabase/server";

export interface GbCampaign {
  id: number;
  title: string;
  url: string | null;
  status: string | null;
  goal: number | null;
  raised: number | null;
  donors: number | null;
  end_at: string | null;
  event_id: string | null;
  show_as_fundraiser: boolean;
  families_registered: number;
  tickets_sold: number;
  synced_at: string;
}

export interface GbOrder {
  id: number;
  campaign_id: number;
  family_id: string | null;
  name: string | null;
  amount: number | null;
  tickets: number;
  items: { type: string | null; description: string; quantity: number }[];
  status: string | null;
  created_at: string | null;
}

const CAMPAIGN_COLS =
  "id, title, url, status, goal, raised, donors, end_at, event_id, show_as_fundraiser, families_registered, tickets_sold, synced_at";
const ORDER_COLS = "id, campaign_id, family_id, name, amount, tickets, items, status, created_at";

export async function getCampaigns(): Promise<GbCampaign[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("givebutter_campaigns").select(CAMPAIGN_COLS).order("id", { ascending: false });
  return (data ?? []) as GbCampaign[];
}

/** The Givebutter campaign tied to an event (the newest, if more than one). */
export async function getEventCampaign(eventId: string): Promise<GbCampaign | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("givebutter_campaigns")
    .select(CAMPAIGN_COLS)
    .eq("event_id", eventId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as GbCampaign | null) ?? null;
}

/** Orders visible to the signed-in adult: their family's, or everyone's for leaders (RLS decides). */
export async function getOrders(campaignIds: number[]): Promise<GbOrder[]> {
  if (!campaignIds.length) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("givebutter_orders")
    .select(ORDER_COLS)
    .in("campaign_id", campaignIds)
    .order("created_at", { ascending: false })
    .limit(2000);
  return (data ?? []) as GbOrder[];
}

export function isPaid(o: Pick<GbOrder, "status">) {
  return !o.status || ["succeeded", "authorized", "captured", "paid", "completed"].includes(o.status.toLowerCase());
}

export function money(n: number | null | undefined) {
  return "$" + Math.round(Number(n ?? 0)).toLocaleString("en-US");
}
