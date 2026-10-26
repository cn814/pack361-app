import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CircleCheck, Trash2 } from "lucide-react";
import ActionForm, { Field } from "@/components/ActionForm";
import BackLink from "@/components/BackLink";
import PrintButton from "@/components/PrintButton";
import ShoppingList, { type ShoppingRow } from "@/components/ShoppingList";
import SubmitButton from "@/components/SubmitButton";
import { isCampCook, requireMember } from "@/lib/data";
import { fmtRange } from "@/lib/format";
import { EATER_GROUPS, MEALS, byStore, formatAmount, formatPacks, mergeCounts, portions, shoppingList, totalPeople } from "@/lib/kitchen";
import { getEventKitchen, getKitchenEvents, getRecipes } from "@/lib/kitchen-data";
import { addMenuItem, clearShoppingChecks, copyMenu, removeMenuItem, saveCounts } from "../../actions";

export const metadata: Metadata = { title: "Campout menu" };

const DONE: Record<string, string> = {
  removed: "Taken off the menu.",
  copied: "Menu copied. Change anything you like.",
};

const MEAL_NAMES = [
  "Friday cracker barrel",
  "Saturday breakfast",
  "Saturday lunch",
  "Saturday dinner",
  "Saturday dessert",
  "Snacks",
  "Sunday breakfast",
  "All weekend",
];

const pct = (n: number) => `${Math.round(n * 100)}%`;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** A campout's kitchen: who's eating, the menu, and the shopping list sized to them. */
export default async function EventKitchenPage({ params, searchParams }: PageProps<"/kitchen/events/[id]">) {
  const me = await requireMember();
  if (!isCampCook(me)) redirect("/pack");
  const { id } = await params;
  const sp = await searchParams;
  const [k, recipes, events] = await Promise.all([getEventKitchen(id), getRecipes(), getKitchenEvents()]);
  if (!k) notFound();
  const done = DONE[String(sp.done ?? "")];

  const counts = mergeCounts(k.rsvpCounts, k.overrides);
  const people = totalPeople(counts);
  const portionCount = round1(portions(counts, k.weights));
  const lines = shoppingList(k.menu, portionCount);
  const stores = byStore(lines).map((g) => ({
    store: g.store,
    rows: g.lines.map(
      (l): ShoppingRow => ({
        key: l.key,
        name: l.name,
        amount: l.need === null ? "" : `${formatAmount(l.need)} ${l.unit ?? ""}`.trim(),
        buy: l.packs === null ? "" : formatPacks(l),
        detail: [l.uses.join(", "), ...l.notes].join(" · "),
      }),
    ),
  }));
  const meals: { label: string; items: typeof k.menu }[] = [];
  for (const m of k.menu) {
    const g = meals.find((x) => x.label === m.meal_label);
    if (g) g.items.push(m);
    else meals.push({ label: m.meal_label, items: [m] });
  }
  const copyFrom = [...events.upcoming, ...events.past].filter((e) => e.id !== id && e.meals > 0);
  const nextMeal = MEAL_NAMES.find((n) => !meals.some((m) => m.label === n)) ?? "";

  return (
    <>
      <BackLink href="/kitchen" label="Camp kitchen" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">{k.event.title}</h1>
      <p className="-mt-1 text-sm text-muted">{fmtRange(k.event.starts_at, k.event.ends_at)}</p>
      {done && (
        <p className="flex items-center gap-1.5 rounded-xl bg-mint p-3 text-sm font-semibold text-pine">
          <CircleCheck className="h-4 w-4 shrink-0" aria-hidden /> {done}
        </p>
      )}

      <section className="card grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-2xl font-extrabold text-pine-950">{people}</p>
          <p className="text-xs text-muted">people</p>
        </div>
        <div>
          <p className="text-2xl font-extrabold text-pine-950">{portionCount}</p>
          <p className="text-xs text-muted">adult portions</p>
        </div>
        <div>
          <p className="text-2xl font-extrabold text-pine-950">{k.menu.length}</p>
          <p className="text-xs text-muted">on the menu</p>
        </div>
      </section>

      <section id="headcount" className="space-y-2 print:hidden">
        <h2 className="section-title px-1">Who&apos;s eating</h2>
        <p className="px-1 text-xs text-muted">
          From the RSVPs (families going, not the waitlist). Givebutter sign-ups count each scout by den, and siblings by age when the
          sign-up asked. Otherwise a family&apos;s scouts count by their den on the roster, and siblings as &ldquo;age not known&rdquo;. Type
          your own number for a group to use it instead (day visitors, a family that told you in person); clear it to go back to the
          RSVPs.
        </p>
        <ActionForm action={saveCounts} submit="Save headcount" resetOnSuccess={false} className="card space-y-3">
          <input type="hidden" name="event_id" value={k.event.id} />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2 pr-2 font-bold">Group</th>
                  <th className="px-2 py-2 text-right font-bold">RSVPs</th>
                  <th className="px-2 py-2 font-bold">Your count</th>
                  <th className="py-2 pl-2 text-right font-bold">Eats</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {EATER_GROUPS.map((g) => {
                  const own = k.overrides[g.key];
                  const fromRsvp = k.rsvpCounts[g.key] ?? 0;
                  const quiet = !fromRsvp && own === undefined;
                  return (
                    <tr key={g.key} className={quiet ? "text-muted" : "text-ink"}>
                      <td className="py-1.5 pr-2">{g.label}</td>
                      <td className="px-2 py-1.5 text-right font-semibold">{fromRsvp}</td>
                      <td className="px-2 py-1">
                        <input
                          className="input h-9 w-20 py-1"
                          name={`count_${g.key}`}
                          inputMode="numeric"
                          aria-label={`Your count: ${g.label}`}
                          defaultValue={own === undefined ? "" : own}
                          placeholder="–"
                        />
                      </td>
                      <td className="py-1.5 pl-2 text-right text-xs">{pct(k.weights[g.key] ?? 1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">
            &ldquo;Eats&rdquo; is the share of an adult portion.{" "}
            <Link href="/kitchen/appetites" className="font-semibold text-pine">
              Change the appetites
            </Link>
          </p>
        </ActionForm>
      </section>

      <section id="menu" className="space-y-2">
        <h2 className="section-title px-1">Menu</h2>
        {meals.length === 0 ? (
          <p className="card text-sm text-muted">Nothing on the menu yet. Add recipes below{copyFrom.length ? ", or copy another campout's menu" : ""}.</p>
        ) : (
          meals.map((g) => (
            <div key={g.label} className="card space-y-1 p-0">
              <h3 className="border-b border-line px-3 py-2 font-bold text-pine-950">{g.label}</h3>
              <ul className="divide-y divide-line">
                {g.items.map((m) => {
                  const forN = round1(portionCount * m.people_share);
                  return (
                    <li key={m.id} className="flex items-center gap-2 px-3 py-2">
                      <Link href={`/kitchen/recipes/${m.recipe.id}?for=${forN}&from=${k.event.id}`} className="min-w-0 flex-1">
                        <span className="block font-semibold text-pine">{m.recipe.title}</span>
                        <span className="block text-xs text-muted">
                          For {forN} portions{m.people_share !== 1 ? ` (${pct(m.people_share)} of the group)` : ""} · recipe feeds{" "}
                          {m.recipe.servings}, so make it ×{formatAmount(forN / m.recipe.servings)}
                          {m.note ? ` · ${m.note}` : ""}
                        </span>
                      </Link>
                      <form action={removeMenuItem} className="print:hidden">
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="event_id" value={k.event.id} />
                        <SubmitButton className="btn-ghost px-2 text-danger" aria-label={`Take ${m.recipe.title} off the menu`}>
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </SubmitButton>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}

        <ActionForm action={addMenuItem} submit="Add to the menu" busy="Adding…" resetOnSuccess={false} className="card space-y-3 print:hidden">
          <input type="hidden" name="event_id" value={k.event.id} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Meal">
              <input className="input" name="meal_label" required maxLength={80} list="meal-names" defaultValue={nextMeal} placeholder="Saturday dinner" />
              <datalist id="meal-names">
                {MEAL_NAMES.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </Field>
            <Field label="How much of the group" hint="100% unless some families leave early or skip it.">
              <input className="input" name="people_pct" inputMode="numeric" defaultValue={100} />
            </Field>
          </div>
          <Field label="Recipe">
            <select className="input" name="recipe_id" required defaultValue="">
              <option value="" disabled>
                Choose a recipe
              </option>
              {MEALS.map((meal) => {
                const list = recipes.filter((r) => r.meal === meal);
                return list.length ? (
                  <optgroup key={meal} label={meal}>
                    {list.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
          </Field>
          <Field label="Note (optional)">
            <input className="input" name="note" maxLength={300} placeholder="e.g. Cindy is cooking" />
          </Field>
        </ActionForm>

        {copyFrom.length > 0 && (
          <details className="card print:hidden">
            <summary className="cursor-pointer text-sm font-bold text-navy">Copy another campout&apos;s menu</summary>
            <ActionForm action={copyMenu} submit="Copy menu" busy="Copying…" className="mt-3 space-y-3">
              <input type="hidden" name="event_id" value={k.event.id} />
              <Field label="From">
                <select className="input" name="from_event_id" required defaultValue="">
                  <option value="" disabled>
                    Choose a campout
                  </option>
                  {copyFrom.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} ({e.meals} items)
                    </option>
                  ))}
                </select>
              </Field>
              <p className="text-xs text-muted">Adds its meals to this menu. The shopping list is worked out again for this campout&apos;s headcount.</p>
            </ActionForm>
          </details>
        )}
      </section>

      <section id="shopping" className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="section-title">Shopping list</h2>
          <div className="print:hidden">
            <PrintButton label="Print" />
          </div>
        </div>
        {lines.length === 0 ? (
          <p className="card text-sm text-muted">Add recipes to the menu and the shopping list fills in here.</p>
        ) : (
          <>
            <p className="px-1 text-xs text-muted">
              For {portionCount} adult portions. The same item from different recipes is added up, and rounded up to whole packages where
              the recipe says how it&apos;s sold. Every cook sees the same ticks. Check the pack&apos;s bins for syrup, spices and the like
              before you shop.
            </p>
            <ShoppingList eventId={k.event.id} stores={stores} checked={[...k.checked]} />
            {k.checked.size > 0 && (
              <form action={clearShoppingChecks} className="print:hidden">
                <input type="hidden" name="event_id" value={k.event.id} />
                <SubmitButton className="btn-ghost w-full">Untick everything</SubmitButton>
              </form>
            )}
          </>
        )}
      </section>
    </>
  );
}
