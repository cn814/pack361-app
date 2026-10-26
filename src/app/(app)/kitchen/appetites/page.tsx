import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import BackLink from "@/components/BackLink";
import { isCampCook, requireMember } from "@/lib/data";
import { EATER_GROUPS } from "@/lib/kitchen";
import { getAppetites } from "@/lib/kitchen-data";
import { saveAppetites } from "../actions";

export const metadata: Metadata = { title: "Appetites" };

const KIND_LABEL = { adult: "Grown-ups", scout: "Scouts, by den", sibling: "Siblings, by age" } as const;

/** How much of an adult portion each group eats; every campout's shopping list uses these. */
export default async function AppetitesPage() {
  const me = await requireMember();
  if (!isCampCook(me)) redirect("/pack");
  const weights = await getAppetites();
  const kinds = (["adult", "scout", "sibling"] as const).map((kind) => ({ kind, groups: EATER_GROUPS.filter((g) => g.kind === kind) }));

  return (
    <>
      <BackLink href="/kitchen" label="Camp kitchen" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Appetites</h1>
      <p className="-mt-1 text-sm text-muted">
        How much each group eats, as a percent of an adult portion. A campout with 10 adults and 10 Lions at 50% shops for 15 portions.
        These are starting guesses: after a campout, nudge them up or down by what was left over.
      </p>
      <ActionForm action={saveAppetites} submit="Save appetites" resetOnSuccess={false} className="space-y-3">
        {kinds.map(({ kind, groups }) => (
          <section key={kind} className="card space-y-2">
            <h2 className="section-title">{KIND_LABEL[kind]}</h2>
            {groups.map((g) => (
              <label key={g.key} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 text-sm text-ink">{g.label}</span>
                <input
                  className="input h-9 w-20 py-1 text-right"
                  name={`w_${g.key}`}
                  inputMode="numeric"
                  required
                  defaultValue={Math.round((weights[g.key] ?? 1) * 100)}
                />
                <span className="w-4 text-sm text-muted">%</span>
              </label>
            ))}
          </section>
        ))}
        <p className="px-1 text-xs text-muted">
          A recipe&apos;s amounts are for adult-size portions. The pack&apos;s campout recipes that &ldquo;feed 50&rdquo; are the Late Spring
          2026 shopping for 60 people, kids and adults together, which comes to about 50 adult portions with these starting percents.
          If you change the percents a lot, check those recipes still come out right.
        </p>
      </ActionForm>
    </>
  );
}
