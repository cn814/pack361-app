import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import RecipeForm from "@/components/RecipeForm";
import { isCampCook, requireMember } from "@/lib/data";

export const metadata: Metadata = { title: "Add a recipe" };

export default async function NewRecipePage() {
  const me = await requireMember();
  if (!isCampCook(me)) redirect("/pack");
  return (
    <>
      <BackLink href="/kitchen" label="Camp kitchen" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Add a recipe</h1>
      <p className="-mt-1 text-sm text-muted">Write the amounts for the number it feeds; the app scales it to each campout.</p>
      <RecipeForm />
    </>
  );
}
