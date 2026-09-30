"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/data";
import { isAdmin } from "@/lib/advancement-data";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { givebutterConfigured, syncGivebutter } from "@/lib/givebutter";
import { matchScout, parseTrailsEnd } from "@/lib/popcorn";

export type ActionState = { ok?: boolean; error?: string; message?: string; unmatched?: string[] };

export async function syncGivebutterNow(): Promise<ActionState> {
  const me = await requireMember();
  if (!isAdmin(me)) return { error: "Only pack admins can sync." };
  if (!adminConfigured() || !givebutterConfigured()) {
    return { error: "Add GIVEBUTTER_API_KEY and SUPABASE_SECRET_KEY in Vercel first." };
  }
  try {
    const r = await syncGivebutter(createAdminClient());
    revalidatePath("/", "layout");
    return { ok: true, message: `Synced ${r.campaigns} campaigns and ${r.orders} orders (${r.matchedFamilies} pack families matched).` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sync failed." };
  }
}

export async function setFundraiserFlag(form: FormData) {
  const me = await requireMember();
  if (!isAdmin(me)) return;
  const supabase = await createClient();
  await supabase
    .from("givebutter_campaigns")
    .update({ show_as_fundraiser: form.get("show") === "true" })
    .eq("id", Number(form.get("id")));
  revalidatePath("/fundraisers");
}

const SETTING_KEYS = ["popcorn_scout_goal", "popcorn_ends", "popcorn_store_url", "popcorn_note"] as const;

export async function savePopcornSettings(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMember();
  if (!isAdmin(me)) return { error: "Only pack admins can change this." };
  const rows = SETTING_KEYS.map((key) => ({
    key,
    value: String(form.get(key) ?? "").trim().slice(0, 500),
    updated_at: new Date().toISOString(),
  }));
  const url = rows.find((r) => r.key === "popcorn_store_url")!.value;
  if (url && !/^https:\/\//.test(url)) return { error: "The store link should start with https://" };
  const supabase = await createClient();
  const { error } = await supabase.from("pack_settings").upsert(rows, { onConflict: "key" });
  if (error) return { error: "Couldn't save." };
  revalidatePath("/popcorn");
  return { ok: true, message: "Saved." };
}

export async function setPopcornSale(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMember();
  if (!isAdmin(me)) return { error: "Only pack admins can enter sales." };
  const scoutId = String(form.get("scout_id") ?? "");
  const amount = Number(String(form.get("amount") ?? "").replace(/[$,]/g, ""));
  if (!scoutId || !isFinite(amount) || amount < 0) return { error: "Pick a scout and enter a dollar amount." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("popcorn_sales")
    .upsert({ scout_id: scoutId, amount, updated_at: new Date().toISOString() }, { onConflict: "scout_id" });
  if (error) return { error: "Couldn't save." };
  revalidatePath("/popcorn");
  return { ok: true, message: "Saved." };
}

export async function importTrailsEnd(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMember();
  if (!isAdmin(me)) return { error: "Only pack admins can import." };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the Trail's End export first." };
  let parsed;
  try {
    parsed = parseTrailsEnd(await file.text());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't read that file." };
  }
  const supabase = await createClient();
  const { data: scouts } = await supabase.from("scouts").select("id, first_name, last_name").eq("is_active", true);
  const totals = new Map<string, number>();
  const unmatched: string[] = [];
  for (const r of parsed.rows) {
    const s = matchScout(r.name, scouts ?? []);
    if (!s) unmatched.push(r.name);
    else totals.set(s.id, (totals.get(s.id) ?? 0) + r.amount);
  }
  if (!totals.size) return { error: `No scouts matched (read "${parsed.nameCol}" and "${parsed.amountCol}").`, unmatched };
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("popcorn_sales")
    .upsert([...totals].map(([scout_id, amount]) => ({ scout_id, amount, updated_at: now })), { onConflict: "scout_id" });
  if (error) return { error: "Couldn't save the sales." };
  revalidatePath("/popcorn");
  return {
    ok: true,
    message: `Updated ${totals.size} scouts from "${parsed.amountCol}".`,
    unmatched: [...new Set(unmatched)],
  };
}
