"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/ActionForm";
import { isCommittee, requireMember } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** Committee: create or update a guide page. */
export async function saveGuidePage(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  if (!isCommittee(me)) return { error: "Only committee members can edit the guide." };
  const id = String(form.get("id") ?? "");
  const title = String(form.get("title") ?? "").trim().slice(0, 120);
  const section = String(form.get("section") ?? "").trim().slice(0, 60) || "Getting started";
  const summary = String(form.get("summary") ?? "").trim().slice(0, 300) || null;
  const body = String(form.get("body") ?? "").replace(/\r/g, "").slice(0, 30000);
  const sort = Number(form.get("sort_order") ?? 100);
  const published = form.get("is_published") === "on";
  const isPublic = published && form.get("is_public") === "on";
  if (!title) return { error: "Give the page a title." };
  const row = { title, section, summary, body, sort_order: Number.isFinite(sort) ? Math.round(sort) : 100, is_published: published, is_public: isPublic };

  const supabase = await createClient();
  let slug: string;
  if (id) {
    const { data, error } = await supabase.from("guide_pages").update(row).eq("id", id).select("slug").maybeSingle();
    if (error || !data) return { error: "Couldn't save that page." };
    slug = data.slug as string;
  } else {
    slug = slugify(String(form.get("slug") ?? "") || title);
    if (!slug) return { error: "Give the page a title with some letters in it." };
    const { error } = await supabase.from("guide_pages").insert({ ...row, slug });
    if (error) return { error: error.code === "23505" ? "A page with that web address already exists. Change the title." : "Couldn't add that page." };
  }
  revalidatePath("/guide", "layout");
  redirect(`/guide/${slug}`);
}

/** Committee: remove a guide page. */
export async function deleteGuidePage(form: FormData) {
  const me = await requireMember();
  if (!isCommittee(me)) return;
  const supabase = await createClient();
  await supabase.from("guide_pages").delete().eq("id", String(form.get("id") ?? ""));
  revalidatePath("/guide", "layout");
  redirect("/guide");
}
