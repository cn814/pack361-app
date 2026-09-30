import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Givebutter REST API v1: https://docs.givebutter.com (Bearer API key, paginated { data, links, meta }).
const BASE = "https://api.givebutter.com/v1";
const PAID = new Set(["succeeded", "authorized", "captured", "paid", "completed"]);
const FUNDRAISER_HINT = /attire|apparel|shirt|hoodie|popcorn|donation|fundrais/i;

type Json = Record<string, unknown>;

export function givebutterConfigured(): boolean {
  return Boolean(process.env.GIVEBUTTER_API_KEY);
}

async function fetchAll(path: string): Promise<Json[]> {
  const key = process.env.GIVEBUTTER_API_KEY;
  if (!key) throw new Error("GIVEBUTTER_API_KEY is not set");
  const out: Json[] = [];
  let url: string | null = `${BASE}${path}${path.includes("?") ? "&" : "?"}per_page=100`;
  for (let page = 0; url && page < 100; page++) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Givebutter ${path} returned ${res.status}`);
    const body = (await res.json()) as { data?: Json[]; links?: { next?: string | null } };
    out.push(...(body.data ?? []));
    url = body.links?.next ?? null;
  }
  return out;
}

const str = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const num = (v: unknown) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));

interface LineItem {
  type: string | null;
  description: string;
  quantity: number;
}

/** Line items live on the transaction or on its nested payment attempts, depending on API version. */
function lineItems(t: Json): LineItem[] {
  const nested = Array.isArray(t.transactions)
    ? (t.transactions as Json[]).flatMap((x) => (Array.isArray(x.line_items) ? (x.line_items as Json[]) : []))
    : [];
  const direct = Array.isArray(t.line_items) ? (t.line_items as Json[]) : [];
  return [...direct, ...nested].map((li) => ({
    type: str(li.type),
    description: str(li.description) ?? str(li.name) ?? str(li.subtype) ?? "Item",
    quantity: num(li.quantity) ?? 1,
  }));
}

export interface SyncResult {
  campaigns: number;
  orders: number;
  matchedFamilies: number;
}

/** Copy Givebutter campaigns and transactions into Supabase. Needs the admin (secret key) client. */
export async function syncGivebutter(db: SupabaseClient): Promise<SyncResult> {
  const [campaigns, transactions] = await Promise.all([fetchAll("/campaigns"), fetchAll("/transactions")]);

  const [{ data: events }, { data: existing }, { data: adults }] = await Promise.all([
    db.from("events").select("id, external_id, signup_url"),
    db.from("givebutter_campaigns").select("id, show_as_fundraiser"),
    db.from("adults").select("email, family_id").not("family_id", "is", null),
  ]);
  const keepFlag = new Map((existing ?? []).map((c) => [Number(c.id), Boolean(c.show_as_fundraiser)]));
  const familyByEmail = new Map((adults ?? []).map((a) => [String(a.email).toLowerCase(), a.family_id as string]));

  const eventFor = (c: Json) => {
    const id = str(c.id);
    const slug = str(c.slug);
    const code = str(c.code);
    return (
      (events ?? []).find(
        (e) =>
          (id && e.external_id === id) ||
          (slug && e.signup_url?.toLowerCase().endsWith("/" + slug.toLowerCase())) ||
          (code && e.signup_url?.toLowerCase().includes(code.toLowerCase())),
      )?.id ?? null
    );
  };

  const campaignIds = new Set(campaigns.map((c) => Number(c.id)));
  const orders = transactions
    .filter((t) => campaignIds.has(Number(t.campaign_id)))
    .map((t) => {
      const email = str(t.email)?.toLowerCase() ?? null;
      const items = lineItems(t);
      const tickets = items.filter((i) => i.type === "ticket").reduce((n, i) => n + i.quantity, 0);
      return {
        id: Number(t.id),
        campaign_id: Number(t.campaign_id),
        family_id: email ? (familyByEmail.get(email) ?? null) : null,
        name: [str(t.first_name), str(t.last_name)].filter(Boolean).join(" ") || str(t.company),
        email,
        amount: num(t.amount),
        tickets,
        items,
        status: str(t.status),
        created_at: str(t.transacted_at) ?? str(t.created_at),
        synced_at: new Date().toISOString(),
      };
    });

  const paid = (o: (typeof orders)[number]) => !o.status || PAID.has(o.status.toLowerCase());
  const rows = campaigns.map((c) => {
    const id = Number(c.id);
    const mine = orders.filter((o) => o.campaign_id === id && paid(o));
    return {
      id,
      code: str(c.code),
      title: str(c.title) ?? `Campaign ${id}`,
      slug: str(c.slug),
      url: str(c.url),
      type: str(c.type),
      status: str(c.status),
      goal: num(c.goal),
      raised: num(c.raised),
      donors: num(c.donors),
      end_at: str(c.end_at) ?? str((c.event as Json | undefined)?.end_at),
      event_id: eventFor(c),
      show_as_fundraiser: keepFlag.get(id) ?? FUNDRAISER_HINT.test(str(c.title) ?? ""),
      families_registered: new Set(mine.map((o) => o.family_id ?? o.email ?? String(o.id))).size,
      tickets_sold: mine.reduce((n, o) => n + o.tickets, 0),
      synced_at: new Date().toISOString(),
    };
  });

  const up1 = await db.from("givebutter_campaigns").upsert(rows, { onConflict: "id" });
  if (up1.error) throw new Error(`Saving campaigns failed: ${up1.error.message}`);
  for (let i = 0; i < orders.length; i += 500) {
    const up2 = await db.from("givebutter_orders").upsert(orders.slice(i, i + 500), { onConflict: "id" });
    if (up2.error) throw new Error(`Saving orders failed: ${up2.error.message}`);
  }
  return {
    campaigns: rows.length,
    orders: orders.length,
    matchedFamilies: new Set(orders.map((o) => o.family_id).filter(Boolean)).size,
  };
}
