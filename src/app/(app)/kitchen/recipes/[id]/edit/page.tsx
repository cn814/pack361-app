import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import RecipeForm from "@/components/RecipeForm";
import { isCampCook, requireMember } from "@/lib/data";
import { getRecipe } from "@/lib/kitchen-data";

export const metadata: Metadata = { title: "Edit recipe" };

export default async function EditRecipePage({ params }: PageProps<"/kitchen/recipes/[id]/edit">) {
  const me = await requireMember();
  if (!isCampCook(me)) redirect("/pack");
  const { id } = await params;
  const recipe = await getRecipe(id);
  if (!recipe) notFound();
  return (
    <>
      <BackLink href={`/kitchen/recipes/${recipe.id}`} label={recipe.title} />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Edit recipe</h1>
      <p className="-mt-1 text-sm text-muted">Changes show up on every campout menu that uses this recipe.</p>
      <RecipeForm recipe={recipe} />
    </>
  );
}
