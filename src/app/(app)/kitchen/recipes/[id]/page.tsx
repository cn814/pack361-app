import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CircleCheck, Pencil } from "lucide-react";
import BackLink from "@/components/BackLink";
import PrintButton from "@/components/PrintButton";
import { isCampCook, requireMember } from "@/lib/data";
import { fmtShortDate } from "@/lib/advancement";
import { formatAmount, scaleFactor, scaledAmount } from "@/lib/kitchen";
import { getRecipe } from "@/lib/kitchen-data";
import { easternDate } from "@/lib/tz";

export const metadata: Metadata = { title: "Recipe" };

const DONE: Record<string, string> = { added: "Recipe added.", saved: "Your changes are saved." };

/** One recipe: ingredients scaled to however many it's for, equipment, steps and notes. */
export default async function RecipePage({ params, searchParams }: PageProps<"/kitchen/recipes/[id]">) {
  const me = await requireMember();
  if (!isCampCook(me)) redirect("/pack");
  const { id } = await params;
  const sp = await searchParams;
  const recipe = await getRecipe(id);
  if (!recipe) notFound();
  const wanted = Number(sp.for);
  const forN = Number.isFinite(wanted) && wanted > 0 && wanted <= 2000 ? wanted : recipe.servings;
  const factor = scaleFactor(recipe.servings, forN);
  const scaled = Math.abs(factor - 1) > 1e-9;
  const back = typeof sp.from === "string" && /^[0-9a-f-]{36}$/i.test(sp.from) ? `/kitchen/events/${sp.from}` : "/kitchen";
  const done = DONE[String(sp.done ?? "")];
  const steps = (recipe.steps ?? "").split("\n").map((s) => s.trim()).filter(Boolean);

  return (
    <>
      <div className="flex items-center justify-between print:hidden">
        <BackLink href={back} label={back === "/kitchen" ? "Camp kitchen" : "Campout menu"} />
        <Link href={`/kitchen/recipes/${recipe.id}/edit`} className="inline-flex items-center gap-1 text-sm font-semibold text-pine">
          <Pencil className="h-4 w-4" aria-hidden /> Edit
        </Link>
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">{recipe.title}</h1>
      <p className="-mt-1 text-sm text-muted">
        {recipe.meal}
        {!recipe.active && " · put away"}
        {recipe.summary ? ` · ${recipe.summary}` : ""}
      </p>
      {done && (
        <p className="flex items-center gap-1.5 rounded-xl bg-mint p-3 text-sm font-semibold text-pine">
          <CircleCheck className="h-4 w-4 shrink-0" aria-hidden /> {done}
        </p>
      )}

      <form className="card flex flex-wrap items-end gap-2 print:hidden" method="get">
        {back !== "/kitchen" && <input type="hidden" name="from" value={String(sp.from)} />}
        <label className="block flex-1 space-y-1">
          <span className="text-xs font-bold text-navy">Make it for (adult-size portions)</span>
          <input className="input" name="for" inputMode="decimal" defaultValue={Number(forN.toFixed(1))} />
        </label>
        <button className="btn-primary">Scale</button>
        <p className="w-full text-xs text-muted">
          The recipe as written feeds {recipe.servings}.{" "}
          {scaled && (
            <Link href={`/kitchen/recipes/${recipe.id}${back !== "/kitchen" ? `?from=${sp.from}` : ""}`} className="font-semibold text-pine">
              Back to {recipe.servings}
            </Link>
          )}
        </p>
      </form>

      <section className="card space-y-2">
        <h2 className="section-title">
          Ingredients{scaled ? ` for ${Number(forN.toFixed(1))}` : ""}
        </h2>
        {recipe.ingredients.length === 0 ? (
          <p className="text-sm text-muted">No ingredients yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {recipe.ingredients.map((i) => {
              const amt = scaledAmount(i, factor);
              return (
                <li key={i.id} className="flex gap-3 py-1.5 text-sm">
                  <span className="w-24 shrink-0 text-right font-bold text-pine">
                    {amt === null ? "" : formatAmount(amt)} {i.unit ?? ""}
                  </span>
                  <span className="min-w-0 flex-1 text-ink">
                    {i.name}
                    {i.share !== 1 && <span className="text-muted"> (for {Math.round(i.share * 100)}% of people)</span>}
                    {i.note && <span className="block text-xs text-muted">{i.note}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {recipe.equipment && (
        <section className="card space-y-1">
          <h2 className="section-title">Equipment</h2>
          <p className="whitespace-pre-line text-sm text-ink">{recipe.equipment}</p>
        </section>
      )}
      {steps.length > 0 && (
        <section className="card space-y-2">
          <h2 className="section-title">Steps</h2>
          {scaled && <p className="text-xs text-muted">Amounts in the steps are for the recipe as written ({recipe.servings}).</p>}
          <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </section>
      )}
      {recipe.notes && (
        <section className="card space-y-1">
          <h2 className="section-title">Notes</h2>
          <p className="whitespace-pre-line text-sm text-ink">{recipe.notes}</p>
        </section>
      )}
      <p className="px-1 text-xs text-muted">
        Last changed {fmtShortDate(easternDate(recipe.updated_at))}
        {recipe.updated_by_name ? ` by ${recipe.updated_by_name}` : ""}.
      </p>
      <div className="print:hidden">
        <PrintButton label="Print recipe" />
      </div>
    </>
  );
}
