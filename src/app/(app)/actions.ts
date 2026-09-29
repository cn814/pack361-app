"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isLeader, requireMember } from "@/lib/data";

export type PostState = { ok?: boolean; error?: string };

export async function postAnnouncement(_prev: PostState, form: FormData): Promise<PostState> {
  const me = await requireMember();
  if (!isLeader(me)) return { error: "Only leaders can post." };
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const category = String(form.get("category") ?? "General");
  if (!title || !body) return { error: "Add a title and a message." };
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").insert({
    author_id: me.id,
    title: title.slice(0, 140),
    body: body.slice(0, 4000),
    category,
    is_pinned: form.get("pinned") === "on",
  });
  if (error) return { error: "Couldn't post. Try again." };
  revalidatePath("/");
  return { ok: true };
}

export async function deleteAnnouncement(form: FormData) {
  await requireMember();
  const supabase = await createClient();
  await supabase.from("announcements").delete().eq("id", String(form.get("id")));
  revalidatePath("/");
}

export async function updateMyContact(_prev: PostState, form: FormData): Promise<PostState> {
  const me = await requireMember();
  const phone = String(form.get("phone") ?? "").trim().slice(0, 40) || null;
  const preferred = String(form.get("preferred_name") ?? "").trim().slice(0, 40) || null;
  const supabase = await createClient();
  const { error } = await supabase.from("adults").update({ phone, preferred_name: preferred }).eq("id", me.id);
  if (error) return { error: "Couldn't save." };
  revalidatePath("/family");
  return { ok: true };
}
