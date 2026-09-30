"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/ActionForm";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/data";
import { isAdmin } from "@/lib/advancement-data";
import { COURSE_BY_KEY, defaultExpiry, type CourseKey } from "@/lib/training";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Save one course for one adult. You can update your own; admins can update anyone's. */
export async function saveTraining(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const adultId = String(form.get("adult_id") ?? "");
  const course = String(form.get("course") ?? "") as CourseKey;
  const completed = String(form.get("completed_on") ?? "").trim();
  let expires = String(form.get("expires_on") ?? "").trim();
  if (!COURSE_BY_KEY[course]) return { error: "Unknown course." };
  if (adultId !== me.id && !isAdmin(me)) return { error: "You can only update your own training." };
  if (completed && !DATE.test(completed)) return { error: "Pick the date you finished it." };
  if (expires && !DATE.test(expires)) return { error: "Pick the expiration date." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("adult_trainings")
    .select("completed_on, expires_on")
    .eq("adult_id", adultId)
    .eq("course", course)
    .maybeSingle();
  // A renewal: the finish date changed but the Expires box still shows the old expiry (it's
  // filled in for editing), or it's before the new finish date. Work it out from the new date.
  const renewed = completed && existing && completed !== existing.completed_on && (expires === (existing.expires_on ?? "") || (expires && expires <= completed));
  if (completed && (!expires || renewed)) expires = defaultExpiry(course, completed) ?? (renewed ? "" : expires);

  if (!completed && !expires) {
    await supabase.from("adult_trainings").delete().eq("adult_id", adultId).eq("course", course);
  } else {
    const row = { completed_on: completed || null, expires_on: expires || null };
    const { error } = existing
      ? await supabase.from("adult_trainings").update(row).eq("adult_id", adultId).eq("course", course)
      : await supabase.from("adult_trainings").insert({ adult_id: adultId, course, ...row });
    if (error) return { error: "Couldn't save that." };
  }
  revalidatePath("/leaders/training");
  revalidatePath("/family");
  return { ok: true };
}
