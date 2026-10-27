import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Plus, Scale } from "lucide-react";
import BackLink from "@/components/BackLink";
import { isCampCook, requireMember } from "@/lib/data";
import { fmtEventDates } from "@/lib/format";
import { MEALS } from "@/lib/kitchen";
import { getKitchenEvents, getRecipes } from "@/lib/kitchen-data";

export const metadata: Metadata = { title: "Camp kitchen" };

/** The camp cooks' home: campout menus and shopping lists, and the pack's recipe box. */
export default async function KitchenPage({ searchParams }: PageProps<"/kitchen">) {
  const me = await requireMember();
  if (!isCampCook(me)) redirect("/pack");
  const sp = await searchParams;
  const showAll = sp.recipes === "all";
  const [{ upcoming, past }, recipes] = await Promise.all([getKitchenEvents(), getRecipes({ all: showAll })]);
  const byMeal = MEALS.map((m) => ({ meal: m, list: recipes.filter((r) => r.meal === m) })).filter((g) => g.list.length);

  return (
    <>
      <BackLink href="/pack" label="Pack" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Camp kitchen</h1>
      <p className="-mt-1 text-sm text-muted">
        The pack&apos;s camp recipes, each campout&apos;s menu, and a shopping list sized to who&apos;s coming. Older scouts eat more, so
        each den counts as a share of an adult portion.
      </p>

      <section className="space-y-2">
        <h2 className="section-title px-1">Campouts</h2>
        {upcoming.length === 0 ? (
          <p className="card text-sm text-muted">No campouts on the calendar yet. Once a leader adds one, plan its menu here.</p>
        ) : (
          <ul className="card divide-y divide-line p-0">
            {upcoming.map((e) => (
              <EventLine key={e.id} e={e} />
            ))}
          </ul>
        )}
        {past.length > 0 && (
          <details className="card p-0">
            <summary className="cursor-pointer px-3 py-2.5 text-sm font-bold text-navy">Past menus</summary>
            <ul className="divide-y divide-line border-t border-line">
              {past.map((e) => (
                <EventLine key={e.id} e={e} />
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="section-title">Recipes</h2>
          <Link href={showAll ? "/kitchen" : "/kitchen?recipes=all"} className="text-xs font-semibold text-pine">
            {showAll ? "Hide put-away recipes" : "Show put-away recipes"}
          </Link>
        </div>
        <Link href="/kitchen/recipes/new" className="btn-primary w-full">
          <Plus className="h-4 w-4" aria-hidden /> Add a recipe
        </Link>
        {byMeal.map((g) => (
          <div key={g.meal} className="space-y-1">
            <h3 className="px-1 text-xs font-bold uppercase tracking-wider text-muted">{g.meal}</h3>
            <ul className="card divide-y divide-line p-0">
              {g.list.map((r) => (
                <li key={r.id}>
                  <Link href={`/kitchen/recipes/${r.id}`} className={`flex items-center gap-3 px-3 py-2.5 ${r.active ? "" : "opacity-60"}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-pine-950">{r.title}</span>
                      <span className="block truncate text-xs text-muted">
                        Feeds {r.servings}
                        {r.summary ? ` · ${r.summary}` : ""}
                        {!r.active && " · put away"}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <Link href="/kitchen/appetites" className="card flex items-center gap-3">
        <Scale className="h-5 w-5 shrink-0 text-pine" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-pine-950">Appetites</span>
          <span className="block text-xs text-muted">How much of an adult portion each den and age eats</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </Link>
    </>
  );
}

function EventLine({ e }: { e: { id: string; title: string; starts_at: string; ends_at: string | null; all_day: boolean; meals: number } }) {
  return (
    <li>
      <Link href={`/kitchen/events/${e.id}`} className="flex items-center gap-3 px-3 py-2.5">
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-pine-950">{e.title}</span>
          <span className="block text-xs text-muted">
            {fmtEventDates(e)} · {e.meals ? `${e.meals} on the menu` : "No menu yet"}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </Link>
    </li>
  );
}
