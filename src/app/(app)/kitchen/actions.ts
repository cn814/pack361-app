"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/ActionForm";
import { isCampCook, requireMember } from "@/lib/data";
import { EATER_GROUPS, MEALS } from "@/lib/kitchen";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;
const NOT_A_COOK = "Only the camp cooks and leaders can change the camp kitchen.";

const text = (form: FormData, key: string, max: number) =>
  String(form.get(key) ?? "").replace(/\r/g, "").trim().slice(0, max) || null;

/** "1 1/2", "1.5", "½", "" → number or null; NaN when it isn't a number. */
function parseAmount(raw: string): number | null {
  const s = raw.trim().replace(/¼/g, " 1/4").replace(/½/g, " 1/2").replace(/¾/g, " 3/4").replace(/⅓/g, " 1/3").replace(/⅔/g, " 2/3").replace(/⅛/g, " 1/8").trim();
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)?\s*(?:(\d+)\s*\/\s*(\d+))?$/);
  if (!m || (!m[1] && !m[2])) return NaN;
  const whole = m[1] ? Number(m[1]) : 0;
  const frac = m[2] ? Number(m[2]) / Number(m[3]) : 0;
  return m[3] === "0" ? NaN : whole + frac;
}

async function cook() {
  const me = await requireMember();
  return isCampCook(me) ? me : null;
}

/** A cook adds a recipe or changes one, with its ingredients. */
export async function saveRecipe(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await cook())) return { error: NOT_A_COOK };
  const id = String(form.get("id") ?? "");
  if (id && !UUID.test(id)) return { error: "That recipe wasn't found." };
  const title = text(form, "title", 120);
  if (!title) return { error: "Give the recipe a name." };
  const meal = String(form.get("meal") ?? "Dinner");
  if (!(MEALS as readonly string[]).includes(meal)) return { error: "Choose which meal it's for." };
  const servings = parseAmount(String(form.get("servings") ?? ""));
  if (servings === null || !Number.isFinite(servings) || servings <= 0 || servings > 1000)
    return { error: "How many people does the recipe feed? A number from 1 to 1000." };

  const names = form.getAll("ing_name").map((v) => String(v).trim().slice(0, 120));
  const col = (k: string) => form.getAll(k).map((v) => String(v));
  const [amounts, units, shares, packSizes, packUnits, stores, notes] = [
    col("ing_amount"),
    col("ing_unit"),
    col("ing_share"),
    col("ing_pack_size"),
    col("ing_pack_unit"),
    col("ing_store"),
    col("ing_note"),
  ];
  const ingredients: Record<string, unknown>[] = [];
  for (let i = 0; i < names.length && ingredients.length < 100; i++) {
    if (!names[i]) continue;
    const amount = parseAmount(amounts[i] ?? "");
    if (amount !== null && (!Number.isFinite(amount) || amount > 100000))
      return { error: `Check the amount for ${names[i]}: a number like 2, 1.5 or 1 1/2.` };
    const sharePct = (shares[i] ?? "").trim() ? Number(shares[i]) : 100;
    if (!Number.isFinite(sharePct) || sharePct <= 0 || sharePct > 500) return { error: `Check “how many take it” for ${names[i]}: a percent, like 75.` };
    const packSize = parseAmount(packSizes[i] ?? "");
    if (packSize !== null && (!Number.isFinite(packSize) || packSize <= 0 || packSize > 100000))
      return { error: `Check how ${names[i]} is sold: how much of it is in one package.` };
    const cut = (v: string | undefined, max: number) => (v ?? "").trim().slice(0, max) || null;
    ingredients.push({
      position: ingredients.length + 1,
      name: names[i],
      amount,
      unit: cut(units[i], 40),
      share: sharePct / 100,
      pack_size: packSize,
      pack_unit: packSize ? cut(packUnits[i], 60) : null,
      store: cut(stores[i], 40),
      note: cut(notes[i], 300),
    });
  }

  const row = {
    title,
    meal,
    servings,
    summary: text(form, "summary", 500),
    equipment: text(form, "equipment", 2000),
    steps: text(form, "steps", 10000),
    notes: text(form, "notes", 4000),
    active: id ? form.get("active") === "on" : true,
  };
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("recipes").update(row).eq("id", id).select("id").maybeSingle()
    : await supabase.from("recipes").insert(row).select("id").maybeSingle();
  if (error || !data) return { error: "Couldn't save the recipe. Try again." };
  const recipeId = data.id as string;

  // The ingredient list is replaced as a whole (it's short, and the order is the cook's).
  if (id) {
    const del = await supabase.from("recipe_ingredients").delete().eq("recipe_id", recipeId);
    if (del.error) return { error: "Saved the recipe, but couldn't update its ingredients. Try again." };
  }
  if (ingredients.length) {
    const ins = await supabase.from("recipe_ingredients").insert(ingredients.map((x) => ({ ...x, recipe_id: recipeId })));
    if (ins.error) return { error: "Saved the recipe, but couldn't save its ingredients. Tap Save again." };
  }
  revalidatePath("/kitchen", "layout");
  redirect(`/kitchen/recipes/${recipeId}?done=${id ? "saved" : "added"}`);
}

/** A cook adds a recipe to a meal on a campout's menu. */
export async function addMenuItem(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await cook())) return { error: NOT_A_COOK };
  const eventId = String(form.get("event_id") ?? "");
  const recipeId = String(form.get("recipe_id") ?? "");
  if (!UUID.test(eventId)) return { error: "That event wasn't found." };
  if (!UUID.test(recipeId)) return { error: "Choose a recipe." };
  const label = text(form, "meal_label", 80);
  if (!label) return { error: "Name the meal, e.g. “Saturday breakfast”." };
  const pct = Number(form.get("people_pct") ?? 100);
  if (!Number.isFinite(pct) || pct <= 0 || pct > 300) return { error: "How much of the group eats this meal? A percent, like 100." };
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("event_menu_items")
    .select("position")
    .eq("event_id", eventId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("event_menu_items").insert({
    event_id: eventId,
    recipe_id: recipeId,
    meal_label: label,
    people_share: pct / 100,
    note: text(form, "note", 300),
    position: Number(last?.position ?? 0) + 1,
  });
  if (error) return { error: "Couldn't add that to the menu. Try again." };
  revalidatePath(`/kitchen/events/${eventId}`);
  revalidatePath("/kitchen");
  return { ok: true, message: "Added to the menu. The shopping list is updated." };
}

/** A cook takes a recipe off a campout's menu. */
export async function removeMenuItem(form: FormData) {
  const eventId = String(form.get("event_id") ?? "");
  const id = String(form.get("id") ?? "");
  if (!UUID.test(eventId)) redirect("/kitchen");
  if ((await cook()) && UUID.test(id)) {
    const supabase = await createClient();
    await supabase.from("event_menu_items").delete().eq("id", id).eq("event_id", eventId);
    revalidatePath("/kitchen");
  }
  redirect(`/kitchen/events/${eventId}?done=removed#menu`);
}

/** A cook starts a campout's menu from another campout's. */
export async function copyMenu(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await cook())) return { error: NOT_A_COOK };
  const to = String(form.get("event_id") ?? "");
  const from = String(form.get("from_event_id") ?? "");
  if (!UUID.test(to) || !UUID.test(from) || to === from) return { error: "Choose a campout to copy from." };
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("event_menu_items")
    .select("meal_label, position, recipe_id, people_share, note")
    .eq("event_id", from)
    .order("position");
  if (!items?.length) return { error: "That campout has no menu to copy." };
  const { data: last } = await supabase
    .from("event_menu_items")
    .select("position")
    .eq("event_id", to)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const start = Number(last?.position ?? 0);
  const { error } = await supabase
    .from("event_menu_items")
    .insert(items.map((m, i) => ({ ...m, event_id: to, position: start + i + 1 })));
  if (error) return { error: "Couldn't copy the menu. Try again." };
  revalidatePath("/kitchen");
  redirect(`/kitchen/events/${to}?done=copied#menu`);
}

/** A cook's own headcount for some groups (blank = use the RSVPs). */
export async function saveCounts(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await cook())) return { error: NOT_A_COOK };
  const eventId = String(form.get("event_id") ?? "");
  if (!UUID.test(eventId)) return { error: "That event wasn't found." };
  const set: { event_id: string; grp: string; count: number; updated_at: string }[] = [];
  const clear: string[] = [];
  for (const g of EATER_GROUPS) {
    const raw = String(form.get(`count_${g.key}`) ?? "").trim();
    if (!raw) {
      clear.push(g.key);
      continue;
    }
    const v = Number(raw);
    if (!Number.isInteger(v) || v < 0 || v > 500) return { error: `${g.label}: a whole number from 0 to 500, or blank to use the RSVPs.` };
    set.push({ event_id: eventId, grp: g.key, count: v, updated_at: new Date().toISOString() });
  }
  const supabase = await createClient();
  if (clear.length) {
    const del = await supabase.from("event_food_counts").delete().eq("event_id", eventId).in("grp", clear);
    if (del.error) return { error: "Couldn't save the headcount. Try again." };
  }
  if (set.length) {
    const up = await supabase.from("event_food_counts").upsert(set, { onConflict: "event_id,grp" });
    if (up.error) return { error: "Couldn't save the headcount. Try again." };
  }
  revalidatePath(`/kitchen/events/${eventId}`);
  return { ok: true, message: "Headcount saved. The shopping list is updated." };
}

/** Tick an item off the shopping list, or untick it. */
export async function setShoppingCheck(eventId: string, key: string, checked: boolean): Promise<ActionResult> {
  const me = await cook();
  if (!me) return { error: NOT_A_COOK };
  if (!UUID.test(eventId) || !key || key.length > 300) return { error: "That item wasn't found." };
  const supabase = await createClient();
  const { error } = checked
    ? await supabase
        .from("event_shopping_checks")
        .upsert({ event_id: eventId, item_key: key, checked_by: me.id, checked_at: new Date().toISOString() }, { onConflict: "event_id,item_key" })
    : await supabase.from("event_shopping_checks").delete().eq("event_id", eventId).eq("item_key", key);
  if (error) return { error: "Couldn't save that tick. Try again." };
  return { ok: true };
}

/** Untick the whole shopping list (shopping for the next trip with the same menu). */
export async function clearShoppingChecks(form: FormData) {
  const eventId = String(form.get("event_id") ?? "");
  if (!UUID.test(eventId)) redirect("/kitchen");
  if (await cook()) {
    const supabase = await createClient();
    await supabase.from("event_shopping_checks").delete().eq("event_id", eventId);
  }
  revalidatePath(`/kitchen/events/${eventId}`);
  redirect(`/kitchen/events/${eventId}#shopping`);
}

/** The appetite weights: how much of an adult portion each group eats. */
export async function saveAppetites(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await cook();
  if (!me) return { error: NOT_A_COOK };
  const rows: { grp: string; weight: number }[] = [];
  for (const g of EATER_GROUPS) {
    const raw = String(form.get(`w_${g.key}`) ?? "").trim();
    const pct = Number(raw);
    if (!raw || !Number.isFinite(pct) || pct < 0 || pct > 300) return { error: `${g.label}: a percent of an adult portion, 0 to 300.` };
    rows.push({ grp: g.key, weight: Math.round(pct) / 100 });
  }
  const supabase = await createClient();
  for (const r of rows) {
    const { error } = await supabase
      .from("food_appetites")
      .update({ weight: r.weight, updated_at: new Date().toISOString(), updated_by: me.id })
      .eq("grp", r.grp);
    if (error) return { error: "Couldn't save the appetites. Try again." };
  }
  revalidatePath("/kitchen", "layout");
  return { ok: true, message: "Saved. Every campout's shopping list uses the new numbers." };
}
