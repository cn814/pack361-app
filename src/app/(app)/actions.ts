"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { sendPushToAll } from "@/lib/push";
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
  if (form.getAll("notify").includes("on")) {
    after(async () => {
      await sendPushToAll({ title: `Pack 361: ${title.slice(0, 80)}`, body: body.slice(0, 180), url: "/", tag: "announcement" }, me.id);
    });
  }
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

/** A family answers "may this scout appear in pack photos?" (RLS: own scouts only). */
export async function setPhotoPermission(form: FormData) {
  await requireMember();
  const scoutId = String(form.get("scout_id") ?? "");
  const answer = String(form.get("answer") ?? "");
  if (answer !== "yes" && answer !== "no") return;
  const supabase = await createClient();
  await supabase.from("scouts").update({ photo_permission: answer }).eq("id", scoutId);
  revalidatePath("/family");
  revalidatePath("/");
}
