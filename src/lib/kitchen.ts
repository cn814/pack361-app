// Camp kitchen math: who's eating (weighted by appetite), recipes scaled to them, and the shopping
// list. Pure functions; the pages read the data and call these. See 20261102000000_camp_kitchen.sql.

import type { EaterGroup } from "./givebutter-rsvp";

export type { EaterGroup };

export const EATER_GROUPS: { key: EaterGroup; label: string; kind: "adult" | "scout" | "sibling" }[] = [
  { key: "adult", label: "Adults", kind: "adult" },
  { key: "lion", label: "Lions", kind: "scout" },
  { key: "tiger", label: "Tigers", kind: "scout" },
  { key: "wolf", label: "Wolves", kind: "scout" },
  { key: "bear", label: "Bears", kind: "scout" },
  { key: "webelos", label: "Webelos", kind: "scout" },
  { key: "aol", label: "Arrow of Light", kind: "scout" },
  { key: "scout", label: "Scouts (den not known)", kind: "scout" },
  { key: "sib_0_3", label: "Siblings 3 and under", kind: "sibling" },
  { key: "sib_4_6", label: "Siblings 4–6", kind: "sibling" },
  { key: "sib_7_9", label: "Siblings 7–9", kind: "sibling" },
  { key: "sib_10_12", label: "Siblings 10–12", kind: "sibling" },
  { key: "sib_13_up", label: "Siblings 13 and up", kind: "sibling" },
  { key: "sib", label: "Siblings (age not known)", kind: "sibling" },
];

export const MEALS = ["Breakfast", "Lunch", "Dinner", "Dessert", "Campfire", "Snack", "Drinks", "Kitchen basics"] as const;

export type Counts = Partial<Record<EaterGroup, number>>;
export type Weights = Partial<Record<EaterGroup, number>>;

/** The count for each group: a cook's own number where she set one, otherwise the RSVPs. */
export function mergeCounts(fromRsvps: Counts, overrides: Counts): Counts {
  const out: Counts = {};
  for (const g of EATER_GROUPS) {
    const o = overrides[g.key];
    const n = o !== undefined && o !== null ? o : (fromRsvps[g.key] ?? 0);
    if (n > 0) out[g.key] = n;
  }
  return out;
}

export function totalPeople(counts: Counts): number {
  return EATER_GROUPS.reduce((n, g) => n + (counts[g.key] ?? 0), 0);
}

/** Adult-size portions: each group's count times its appetite weight (1 if not set). */
export function portions(counts: Counts, weights: Weights): number {
  return EATER_GROUPS.reduce((n, g) => n + (counts[g.key] ?? 0) * (weights[g.key] ?? 1), 0);
}

export interface Ingredient {
  name: string;
  amount: number | null;
  unit: string | null;
  share: number;
  pack_size: number | null;
  pack_unit: string | null;
  store: string | null;
  note: string | null;
}

export interface Recipe {
  id: string;
  title: string;
  servings: number;
  ingredients: Ingredient[];
}

export interface MenuItem {
  meal_label: string;
  people_share: number;
  recipe: Recipe;
}

/** How many times the recipe to make for this many portions (some meals are for part of the group). */
export function scaleFactor(recipeServings: number, portionCount: number, peopleShare = 1): number {
  if (!(recipeServings > 0)) return 0;
  return (portionCount * peopleShare) / recipeServings;
}

/** One ingredient's amount, scaled. Null when the recipe gives no amount (to taste). */
export function scaledAmount(i: Pick<Ingredient, "amount" | "share">, factor: number): number | null {
  if (i.amount === null || i.amount === undefined) return null;
  return i.amount * (i.share ?? 1) * factor;
}

export interface ShopLine {
  /** Stable across visits, for ticking off: name, unit and package. */
  key: string;
  name: string;
  unit: string | null;
  /** Total needed in `unit`; null when no recipe gives an amount. */
  need: number | null;
  /** Whole packages to buy, when the ingredient says how it's sold. */
  packs: number | null;
  pack_size: number | null;
  pack_unit: string | null;
  store: string | null;
  /** The recipes it's for, and their notes. */
  uses: string[];
  notes: string[];
}

const clean = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function itemKey(name: string, unit: string | null, packSize: number | null, packUnit: string | null): string {
  return [clean(name), clean(unit), packSize ?? "", clean(packUnit)].join("|").slice(0, 300);
}

/**
 * The shopping list for a menu: every ingredient scaled to the portions, the same item from
 * different recipes added together (same name, unit and package), rounded up to whole packages.
 */
export function shoppingList(menu: MenuItem[], portionCount: number): ShopLine[] {
  const lines = new Map<string, ShopLine>();
  for (const m of menu) {
    const factor = scaleFactor(m.recipe.servings, portionCount, m.people_share);
    for (const i of m.recipe.ingredients) {
      const key = itemKey(i.name, i.unit, i.pack_size, i.pack_unit);
      const amt = scaledAmount(i, factor);
      const line = lines.get(key) ?? {
        key,
        name: i.name.trim(),
        unit: i.unit,
        need: null,
        packs: null,
        pack_size: i.pack_size,
        pack_unit: i.pack_unit,
        store: null,
        uses: [],
        notes: [],
      };
      if (amt !== null) line.need = (line.need ?? 0) + amt;
      if (!line.store && i.store) line.store = i.store.trim();
      if (!line.uses.includes(m.recipe.title)) line.uses.push(m.recipe.title);
      if (i.note && !line.notes.includes(i.note)) line.notes.push(i.note);
      lines.set(key, line);
    }
  }
  for (const l of lines.values()) {
    // A hair over a whole package (floating point) doesn't mean buying another one.
    if (l.need !== null && l.pack_size) l.packs = Math.max(l.need > 0 ? 1 : 0, Math.ceil(l.need / l.pack_size - 1e-6));
  }
  return [...lines.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The list by store; items with no store last, under "Anywhere". */
export function byStore(lines: ShopLine[]): { store: string; lines: ShopLine[] }[] {
  const groups = new Map<string, ShopLine[]>();
  for (const l of lines) {
    const s = l.store || "Anywhere";
    groups.set(s, [...(groups.get(s) ?? []), l]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "Anywhere" ? 1 : b === "Anywhere" ? -1 : a.localeCompare(b)))
    .map(([store, ls]) => ({ store, lines: ls }));
}

const FRACTIONS: [number, string][] = [
  [0.125, "⅛"],
  [0.25, "¼"],
  [1 / 3, "⅓"],
  [0.5, "½"],
  [2 / 3, "⅔"],
  [0.75, "¾"],
];

/**
 * An amount for people to read: whole numbers from 10 up (rounded up, it's shopping), kitchen
 * fractions below that (rounded up to the nearest ⅛, ¼ or ⅓), "a pinch" for a crumb.
 */
export function formatAmount(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "";
  if (n <= 0) return "0";
  if (n >= 10) return String(Math.ceil(n - 1e-6));
  const whole = Math.floor(n + 1e-9);
  const rest = n - whole;
  if (rest < 0.02) return String(whole);
  const frac = FRACTIONS.find(([v]) => v >= rest - 0.02);
  if (!frac) return String(whole + 1);
  if (whole === 0 && n < 0.06) return "a pinch";
  return whole ? `${whole} ${frac[1]}` : frac[1];
}

/** "3 boxes (1-lb box)" style package text. */
export function formatPacks(l: Pick<ShopLine, "packs" | "pack_unit">): string {
  if (l.packs === null) return "";
  return `${l.packs} × ${l.pack_unit || "package"}`;
}
