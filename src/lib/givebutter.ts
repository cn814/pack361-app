import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { customAnswers, planDuesMatch, type Answer, type RosterScout } from "./givebutter-dues";

// Givebutter REST API v1: https://docs.givebutter.com (Bearer API key, paginated { data, links, meta }).
const BASE = "https://api.givebutter.com/v1";
export const PAID = new Set(["succeeded", "authorized", "captured", "paid", "completed"]);
const STORE_HINT = /attire|apparel|shirt|hoodie|merch|store/i;

type Json = Record<string, unknown>;

export function givebutterConfigured(): boolean {
  return Boolean(process.env.GIVEBUTTER_API_KEY);
}

/** Only follow a "next" link back to the Givebutter API itself (the API key goes with it). */
function nextPage(next: string | null | undefined): string | null {
  if (!next) return null;
  try {
    const u = new URL(next);
    return u.protocol === "https:" && u.hostname === "api.givebutter.com" && !u.username && !u.password && (u.port === "" || u.port === "443")
      ? u.toString()
      : null;
  } catch {
    return null;
  }
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
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Givebutter ${path} returned ${res.status}`);
    const body = (await res.json()) as { data?: Json[]; links?: { next?: string | null } };
    out.push(...(body.data ?? []));
    url = nextPage(body.links?.next);
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
  /** Transactions left out because they had no usable id, and the field names one of them had. */
  skipped: number;
  skippedFields: string[];
  matchedFamilies: number;
  duesMatched: number;
  duesNeedReview: number;
}

/** Copy Givebutter campaigns and transactions into Supabase. Needs the admin (secret key) client. */
export async function syncGivebutter(db: SupabaseClient): Promise<SyncResult> {
  const [campaigns, transactions] = await Promise.all([fetchAll("/campaigns"), fetchAll("/transactions")]);

  const [{ data: events }, { data: existing }, { data: adults }, { data: placed }] = await Promise.all([
    db.from("events").select("id, external_id, signup_url"),
    db.from("givebutter_campaigns").select("id, show_as_fundraiser"),
    db.from("adults").select("email, family_id").not("family_id", "is", null),
    db.from("givebutter_orders").select("id, family_id").not("dues_match", "is", null).not("family_id", "is", null),
  ]);
  const keepFlag = new Map((existing ?? []).map((c) => [Number(c.id), Boolean(c.show_as_fundraiser)]));
  const familyByEmail = new Map((adults ?? []).map((a) => [String(a.email).toLowerCase(), a.family_id as string]));
  // Dues orders already placed with a family (by a parent email answer, or by a leader) keep it.
  const placedFamily = new Map((placed ?? []).map((o) => [Number(o.id), o.family_id as string]));
  // Custom-field answers (scout names, parent emails) live only in memory for the dues match below.
  const answersById = new Map<number, Answer[]>();

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
  // A transaction's id is a number; some list entries carry it on their first payment instead.
  const txId = (t: Json): number | null => {
    const nested = Array.isArray(t.transactions) ? ((t.transactions as Json[])[0] ?? {}) : {};
    for (const v of [t.id, t.transaction_id, nested.id]) {
      const n = num(v);
      if (n !== null && Number.isInteger(n) && n > 0) return n;
    }
    return null;
  };
  const inPack = transactions.filter((t) => campaignIds.has(Number(t.campaign_id)));
  const noId = inPack.filter((t) => txId(t) === null);
  const seenIds = new Set<number>();
  const orders = inPack
    .filter((t) => {
      const id = txId(t);
      if (id === null || seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    })
    .map((t) => {
      const id = txId(t)!;
      const email = str(t.email)?.toLowerCase() ?? null;
      const items = lineItems(t);
      const tickets = items.filter((i) => i.type === "ticket").reduce((n, i) => n + i.quantity, 0);
      answersById.set(id, customAnswers(t));
      return {
        id,
        campaign_id: Number(t.campaign_id),
        family_id: placedFamily.get(id) ?? (email ? familyByEmail.get(email) : null) ?? null,
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
      show_as_fundraiser: keepFlag.get(id) ?? STORE_HINT.test(str(c.title) ?? ""),
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
  const dues = await matchDues(db, familyByEmail, answersById);
  return {
    campaigns: rows.length,
    orders: orders.length,
    skipped: noId.length,
    skippedFields: noId.length ? Object.keys(noId[0]).sort().slice(0, 40) : [],
    matchedFamilies: new Set(orders.map((o) => o.family_id).filter(Boolean)).size,
    duesMatched: dues.matched,
    duesNeedReview: dues.needReview,
  };
}

/**
 * Pack dues: each paid order in the dues campaign that hasn't been applied yet is matched to a
 * family and its scouts, and their dues charges are marked paid (see apply_givebutter_dues). Orders
 * it can't place stay "needs review" and are tried again on the next sync.
 */
async function matchDues(
  db: SupabaseClient,
  familyByEmail: Map<string, string>,
  answersById: Map<number, Answer[]>,
): Promise<{ matched: number; needReview: number }> {
  const out = { matched: 0, needReview: 0 };
  const { data: settings } = await db
    .from("pack_settings")
    .select("key, value")
    .in("key", ["dues_givebutter_campaign_id", "dues_amount_cents", "dues_sibling_discount_cents"]);
  const get = (k: string) => (settings ?? []).find((r) => r.key === k)?.value as string | undefined;
  const campaignId = Number(get("dues_givebutter_campaign_id") || NaN);
  if (!Number.isFinite(campaignId)) return out;
  const fullCents = Number(get("dues_amount_cents")) || 0;
  const discountCents = Number(get("dues_sibling_discount_cents")) || 0;

  const [{ data: open }, { data: scouts }] = await Promise.all([
    db.from("givebutter_orders").select("id, email, amount, status").eq("campaign_id", campaignId).is("dues_applied_at", null).limit(2000),
    db.from("scouts").select("id, family_id, first_name, last_name, created_at").eq("is_active", true).order("created_at").order("first_name").order("id"),
  ]);
  const scoutsByFamily = new Map<string, RosterScout[]>();
  for (const s of scouts ?? []) {
    const list = scoutsByFamily.get(s.family_id as string) ?? [];
    list.push({ id: s.id as string, first_name: s.first_name as string, last_name: s.last_name as string });
    scoutsByFamily.set(s.family_id as string, list);
  }
  for (const o of open ?? []) {
    const status = str(o.status)?.toLowerCase();
    if (status && !PAID.has(status)) continue;
    const plan = planDuesMatch(
      { email: str(o.email), amountCents: Math.round((num(o.amount) ?? 0) * 100), answers: answersById.get(Number(o.id)) ?? [] },
      familyByEmail,
      scoutsByFamily,
      fullCents,
      discountCents,
    );
    const { data, error } = await db.rpc("apply_givebutter_dues", {
      p_order_id: Number(o.id),
      p_family_id: plan.familyId,
      p_scout_ids: plan.scoutIds,
      p_match: plan.match,
      p_note: plan.note,
    });
    if (error) throw new Error(`Matching dues order ${o.id} failed: ${error.message}`);
    // apply_givebutter_dues (20261003000100_review_db_fixes.sql) maps the core's 'nothing_due' to
    // 'needs_review' and 'short' to 'partial', so 'partial' is either an overpayment (applied) or an
    // order too small for the scouts' dues (not applied, waiting on a leader). Tell them apart by
    // whether it was applied; accept the raw values too in case the wrapper changes.
    if (data === "needs_review" || data === "nothing_due" || data === "short") out.needReview++;
    else if (data === "matched") out.matched++;
    else if (data === "partial") {
      const { data: row, error: readErr } = await db.from("givebutter_orders").select("dues_applied_at").eq("id", Number(o.id)).maybeSingle();
      if (readErr) throw new Error(`Checking dues order ${o.id} failed: ${readErr.message}`);
      if (row?.dues_applied_at) out.matched++;
      else out.needReview++;
    }
  }
  return out;
}
