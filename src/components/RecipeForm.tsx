"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import ActionForm, { Field } from "@/components/ActionForm";
import { saveRecipe } from "@/app/(app)/kitchen/actions";
import { MEALS, type Ingredient } from "@/lib/kitchen";

interface Row {
  key: number;
  name: string;
  amount: string;
  unit: string;
  share: string;
  pack_size: string;
  pack_unit: string;
  store: string;
  note: string;
}

export interface RecipeFormValues {
  id: string;
  title: string;
  meal: string;
  servings: number;
  summary: string | null;
  equipment: string | null;
  steps: string | null;
  notes: string | null;
  active: boolean;
  ingredients: Ingredient[];
}

const num = (v: number | null) => (v === null || v === undefined ? "" : String(Number(v.toFixed(4))));
let nextKey = 1;
const blank = (): Row => ({ key: nextKey++, name: "", amount: "", unit: "", share: "", pack_size: "", pack_unit: "", store: "", note: "" });

/** The camp cooks: add a recipe or change one, ingredients and all. */
export default function RecipeForm({ recipe }: { recipe?: RecipeFormValues }) {
  const [rows, setRows] = useState<Row[]>(() =>
    recipe?.ingredients.length
      ? recipe.ingredients.map((i) => ({
          key: nextKey++,
          name: i.name,
          amount: num(i.amount),
          unit: i.unit ?? "",
          share: i.share === 1 ? "" : num(i.share * 100),
          pack_size: num(i.pack_size),
          pack_unit: i.pack_unit ?? "",
          store: i.store ?? "",
          note: i.note ?? "",
        }))
      : [blank(), blank(), blank()],
  );
  const set = (key: number, field: keyof Row, value: string) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  const move = (i: number, by: number) =>
    setRows((rs) => {
      const j = i + by;
      if (j < 0 || j >= rs.length) return rs;
      const copy = [...rs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  return (
    <ActionForm action={saveRecipe} submit={recipe ? "Save recipe" : "Add recipe"} resetOnSuccess={false} className="space-y-4">
      {recipe && <input type="hidden" name="id" value={recipe.id} />}
      <div className="card space-y-3">
        <Field label="Name">
          <input className="input" name="title" required maxLength={120} defaultValue={recipe?.title} placeholder="e.g. Walking tacos" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Meal">
            <select className="input" name="meal" defaultValue={recipe?.meal ?? "Dinner"}>
              {MEALS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="Feeds how many" hint="Adult-size portions the amounts below make.">
            <input className="input" name="servings" inputMode="decimal" required defaultValue={recipe?.servings ?? 8} />
          </Field>
        </div>
        <Field label="In a sentence (optional)">
          <input className="input" name="summary" maxLength={500} defaultValue={recipe?.summary ?? ""} placeholder="What it is, when we make it" />
        </Field>
      </div>

      <section className="space-y-2">
        <h2 className="section-title px-1">Ingredients</h2>
        <p className="px-1 text-xs text-muted">
          Amounts for the number it feeds. <b>How many take it</b>: leave blank if everyone does, or a percent (75 if three in four
          people want bacon). <b>Sold as</b>: how much comes in one package, in the same unit, so the shopping list can round up
          (12 eggs in a dozen; 16 oz in a 1-lb pack).
        </p>
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.key} className="card space-y-2 p-3">
              <div className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-xs font-bold text-muted">{i + 1}</span>
                <input
                  className="input flex-1"
                  name="ing_name"
                  aria-label="Ingredient"
                  placeholder="Ingredient"
                  maxLength={120}
                  value={r.name}
                  onChange={(e) => set(r.key, "name", e.target.value)}
                />
                <button type="button" className="btn-ghost px-2" onClick={() => move(i, -1)} aria-label="Move up" disabled={i === 0}>
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </button>
                <button type="button" className="btn-ghost px-2" onClick={() => move(i, 1)} aria-label="Move down" disabled={i === rows.length - 1}>
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  className="btn-ghost px-2 text-danger"
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  aria-label={`Remove ${r.name || "this ingredient"}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Amount">
                  <input className="input" name="ing_amount" inputMode="decimal" placeholder="2 or 1 1/2" value={r.amount} onChange={(e) => set(r.key, "amount", e.target.value)} />
                </Field>
                <Field label="Unit">
                  <input className="input" name="ing_unit" maxLength={40} placeholder="lb, cups, cans" value={r.unit} onChange={(e) => set(r.key, "unit", e.target.value)} />
                </Field>
                <Field label="How many take it (%)">
                  <input className="input" name="ing_share" inputMode="numeric" placeholder="100" value={r.share} onChange={(e) => set(r.key, "share", e.target.value)} />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Sold as: how much">
                  <input className="input" name="ing_pack_size" inputMode="decimal" placeholder="12" value={r.pack_size} onChange={(e) => set(r.key, "pack_size", e.target.value)} />
                </Field>
                <Field label="in a">
                  <input className="input" name="ing_pack_unit" maxLength={60} placeholder="dozen" value={r.pack_unit} onChange={(e) => set(r.key, "pack_unit", e.target.value)} />
                </Field>
                <Field label="Store">
                  <input className="input" name="ing_store" maxLength={40} list="kitchen-stores" placeholder="Any" value={r.store} onChange={(e) => set(r.key, "store", e.target.value)} />
                </Field>
              </div>
              <input
                className="input"
                name="ing_note"
                aria-label="Note"
                maxLength={300}
                placeholder="Note (optional): brand, dairy-free, we may have this"
                value={r.note}
                onChange={(e) => set(r.key, "note", e.target.value)}
              />
            </li>
          ))}
        </ol>
        <datalist id="kitchen-stores">
          <option value="Costco" />
          <option value="Walmart" />
          <option value="Giant" />
          <option value="Aldi" />
        </datalist>
        <button type="button" className="btn-ghost w-full" onClick={() => setRows((rs) => [...rs, blank()])}>
          <Plus className="h-4 w-4" aria-hidden /> Add an ingredient
        </button>
      </section>

      <div className="card space-y-3">
        <Field label="Steps" hint="One step per line.">
          <textarea className="input min-h-40" name="steps" maxLength={10000} defaultValue={recipe?.steps ?? ""} />
        </Field>
        <Field label="Equipment (optional)">
          <textarea className="input min-h-20" name="equipment" maxLength={2000} defaultValue={recipe?.equipment ?? ""} placeholder="Dutch oven, 2 camp stoves, tongs" />
        </Field>
        <Field label="Notes (optional)" hint="What we learned: how much got eaten, what to change next time.">
          <textarea className="input min-h-20" name="notes" maxLength={4000} defaultValue={recipe?.notes ?? ""} />
        </Field>
        {recipe && (
          <label className="flex min-h-10 items-center gap-3 text-sm font-semibold text-ink">
            <input type="checkbox" name="active" defaultChecked={recipe.active} className="h-5 w-5 accent-pine" />
            In the recipe box (untick to put it away)
          </label>
        )}
      </div>
    </ActionForm>
  );
}
