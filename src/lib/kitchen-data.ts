import "server-only";
import { createClient } from "./supabase/server";
import { EATER_GROUPS, type Counts, type EaterGroup, type Ingredient, type MenuItem, type Weights } from "./kitchen";

// The camp kitchen's reads, as the signed-in cook (the database only lets the cooks and leaders
// see the appetite weights, the counts and the shopping ticks). See 20261102000000_camp_kitchen.sql.

export interface RecipeSummary {
  id: string;
  title: string;
  meal: string;
  servings: number;
  summary: string | null;
  active: boolean;
  updated_at: string;
}

export interface RecipeFull extends RecipeSummary {
  equipment: string | null;
  steps: string | null;
  notes: string | null;
  updated_by_name: string | null;
  ingredients: (Ingredient & { id: string; position: number })[];
}

const UUID = /^[0-9a-f-]{36}$/i;
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function getRecipes({ all = false } = {}): Promise<RecipeSummary[]> {
  const supabase = await createClient();
  let q = supabase.from("recipes").select("id, title, meal, servings, summary, active, updated_at").order("title");
  if (!all) q = q.eq("active", true);
  const { data } = await q;
  return (data ?? []).map((r) => ({ ...r, servings: Number(r.servings) }) as RecipeSummary);
}

function toIngredient(i: Record<string, unknown>) {
  return {
    id: i.id as string,
    position: Number(i.position ?? 0),
    name: i.name as string,
    amount: n(i.amount),
    unit: (i.unit as string | null) ?? null,
    share: Number(i.share ?? 1),
    pack_size: n(i.pack_size),
    pack_unit: (i.pack_unit as string | null) ?? null,
    store: (i.store as string | null) ?? null,
    note: (i.note as string | null) ?? null,
  };
}

const INGREDIENT_COLS = "id, position, name, amount, unit, share, pack_size, pack_unit, store, note";

export async function getRecipe(id: string): Promise<RecipeFull | null> {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("recipes")
    .select(
      `id, title, meal, servings, summary, equipment, steps, notes, active, updated_at,
       updater:adults!recipes_updated_by_fkey(first_name, preferred_name, last_name),
       ingredients:recipe_ingredients(${INGREDIENT_COLS})`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const up = (Array.isArray(data.updater) ? data.updater[0] : data.updater) as
    | { first_name: string; preferred_name: string | null; last_name: string }
    | null
    | undefined;
  const ingredients = ((data.ingredients ?? []) as Record<string, unknown>[]).map(toIngredient).sort((a, b) => a.position - b.position);
  return {
    id: data.id,
    title: data.title,
    meal: data.meal,
    servings: Number(data.servings),
    summary: data.summary,
    equipment: data.equipment,
    steps: data.steps,
    notes: data.notes,
    active: data.active,
    updated_at: data.updated_at,
    updated_by_name: up ? `${up.preferred_name || up.first_name} ${up.last_name}` : null,
    ingredients,
  };
}

export interface KitchenEvent {
  id: string;
  title: string;
  category: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  meals: number;
}

/** Upcoming campouts (and any upcoming event with a menu), then the last campouts that had one. */
export async function getKitchenEvents(): Promise<{ upcoming: KitchenEvent[]; past: KitchenEvent[] }> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 3 * 86400000).toISOString();
  const [{ data: events }, { data: menus }] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, category, starts_at, ends_at, all_day")
      .is("archived_at", null)
      .gte("starts_at", since)
      .order("starts_at")
      .limit(200),
    supabase.from("event_menu_items").select("event_id").limit(5000),
  ]);
  const meals = new Map<string, number>();
  for (const m of menus ?? []) meals.set(m.event_id as string, (meals.get(m.event_id as string) ?? 0) + 1);
  const upcoming = (events ?? [])
    .filter((e) => e.category === "Campout" || meals.has(e.id as string))
    .map((e) => ({ ...(e as Omit<KitchenEvent, "meals">), meals: meals.get(e.id as string) ?? 0 }));
  const upIds = new Set(upcoming.map((e) => e.id));
  const pastIds = [...meals.keys()].filter((id) => !upIds.has(id));
  const { data: past } = pastIds.length
    ? await supabase
        .from("events")
        .select("id, title, category, starts_at, ends_at, all_day")
        .in("id", pastIds)
        .order("starts_at", { ascending: false })
        .limit(12)
    : { data: [] };
  return {
    upcoming,
    past: (past ?? []).map((e) => ({ ...(e as Omit<KitchenEvent, "meals">), meals: meals.get(e.id as string) ?? 0 })),
  };
}

export interface MenuRow extends MenuItem {
  id: string;
  position: number;
  note: string | null;
}

export interface EventKitchen {
  event: { id: string; title: string; starts_at: string; ends_at: string | null; category: string; all_day: boolean };
  menu: MenuRow[];
  /** From the RSVPs (families going, not the waitlist). */
  rsvpCounts: Counts;
  /** A cook's own numbers, where set. */
  overrides: Counts;
  weights: Weights;
  checked: Set<string>;
}

export async function getEventKitchen(eventId: string): Promise<EventKitchen | null> {
  if (!UUID.test(eventId)) return null;
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id, title, starts_at, ends_at, category, all_day").eq("id", eventId).maybeSingle();
  if (!event) return null;
  const [menuRes, countsRes, overRes, weightRes, checkRes] = await Promise.all([
    supabase
      .from("event_menu_items")
      .select(
        `id, meal_label, position, people_share, note,
         recipe:recipes(id, title, servings, ingredients:recipe_ingredients(${INGREDIENT_COLS}))`,
      )
      .eq("event_id", eventId)
      .order("position")
      .order("created_at"),
    supabase.rpc("event_eater_counts", { p_event_id: eventId }),
    supabase.from("event_food_counts").select("grp, count").eq("event_id", eventId),
    supabase.from("food_appetites").select("grp, weight"),
    supabase.from("event_shopping_checks").select("item_key").eq("event_id", eventId),
  ]);
  const groups = new Set<string>(EATER_GROUPS.map((g) => g.key));
  const rsvpCounts: Counts = {};
  for (const r of (countsRes.data ?? []) as { grp: string; people: number }[]) {
    if (groups.has(r.grp) && r.people > 0) rsvpCounts[r.grp as EaterGroup] = Number(r.people);
  }
  const overrides: Counts = {};
  for (const r of overRes.data ?? []) if (groups.has(r.grp as string)) overrides[r.grp as EaterGroup] = Number(r.count);
  const weights: Weights = {};
  for (const r of weightRes.data ?? []) if (groups.has(r.grp as string)) weights[r.grp as EaterGroup] = Number(r.weight);
  const menu: MenuRow[] = [];
  for (const m of (menuRes.data ?? []) as Record<string, unknown>[]) {
    const r = (Array.isArray(m.recipe) ? m.recipe[0] : m.recipe) as Record<string, unknown> | null;
    if (!r) continue;
    menu.push({
      id: m.id as string,
      position: Number(m.position ?? 0),
      meal_label: m.meal_label as string,
      people_share: Number(m.people_share ?? 1),
      note: (m.note as string | null) ?? null,
      recipe: {
        id: r.id as string,
        title: r.title as string,
        servings: Number(r.servings),
        ingredients: ((r.ingredients ?? []) as Record<string, unknown>[]).map(toIngredient).sort((a, b) => a.position - b.position),
      },
    });
  }
  return {
    event: event as EventKitchen["event"],
    menu,
    rsvpCounts,
    overrides,
    weights,
    checked: new Set((checkRes.data ?? []).map((c) => c.item_key as string)),
  };
}

export async function getAppetites(): Promise<Weights> {
  const supabase = await createClient();
  const { data } = await supabase.from("food_appetites").select("grp, weight");
  const out: Weights = {};
  for (const r of data ?? []) out[r.grp as EaterGroup] = Number(r.weight);
  return out;
}
