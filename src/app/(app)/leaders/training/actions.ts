"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/ActionForm";
import { createClient } from "@/lib/supabase/server";
import { isCommittee, requireMember } from "@/lib/data";
import { fetchMyScoutingTraining, type SyncResult } from "@/lib/myscouting";
import { isAdmin } from "@/lib/advancement-data";
import { COURSE_BY_KEY, MEMBER_ID, defaultExpiry, type CourseKey } from "@/lib/training";
import { IMPORT_MAX } from "@/lib/training-import";

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ImportPayload {
  rows: { adult_id: string; course: string; completed_on: string | null; expires_on: string | null }[];
  memberIds: { adult_id: string; member_id: string }[];
  /** Report names confirmed as these adults (a ticked row the app flagged), to remember. */
  names?: { adult_id: string; name: string }[];
}

export type ImportResult = ActionResult & { trainings?: number; adults?: number; memberIds?: number };

/**
 * Apply a my.scouting training report that was read and matched in the browser. Only adult
 * IDs, course keys, dates and member IDs arrive here. The database applies a row only when
 * it's newer than what the app has.
 */
export async function applyTrainingImport(payload: ImportPayload): Promise<ImportResult> {
  const me = await requireMember();
  if (!isCommittee(me)) return { error: "Only pack leadership can import training." };
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const ids = Array.isArray(payload?.memberIds) ? payload.memberIds : [];
  if (rows.length > IMPORT_MAX || ids.length > IMPORT_MAX) return { error: `Import at most ${IMPORT_MAX} rows at a time.` };
  if (!rows.length && !ids.length) return { error: "Nothing to apply." };

  const clean = [];
  for (const r of rows) {
    const completed = r.completed_on ?? null;
    const expires = r.expires_on ?? null;
    if (!UUID.test(String(r.adult_id)) || !COURSE_BY_KEY[r.course as CourseKey]) return { error: "Some rows didn't look right. Load the file again." };
    if ((completed && !DATE.test(completed)) || (expires && !DATE.test(expires)) || (!completed && !expires)) {
      return { error: "Some dates didn't look right. Load the file again." };
    }
    clean.push({ adult_id: r.adult_id, course: r.course, completed_on: completed, expires_on: expires });
  }
  const cleanIds = ids
    .filter((x) => UUID.test(String(x.adult_id)) && MEMBER_ID.test(String(x.member_id)))
    .map((x) => ({ adult_id: x.adult_id, member_id: String(x.member_id) }));

  const cleanNames = (Array.isArray(payload?.names) ? payload.names : [])
    .filter((x) => UUID.test(String(x.adult_id)) && typeof x.name === "string" && x.name.trim().length >= 2)
    .slice(0, 200)
    .map((x) => ({ adult_id: x.adult_id, name: x.name.trim().slice(0, 80) }));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_trainings", { p_rows: clean, p_member_ids: cleanIds });
  if (error) return { error: "Couldn't apply the updates. Try again." };
  // Remember confirmed names; the import itself already worked if this fails.
  if (cleanNames.length) await supabase.rpc("remember_adult_names", { p_names: cleanNames });
  const res = (data ?? {}) as { trainings?: number; adults?: number; member_ids?: number };
  revalidatePath("/leaders/training");
  revalidatePath("/family");
  revalidatePath("/", "layout");
  return { ok: true, trainings: res.trainings ?? 0, adults: res.adults ?? 0, memberIds: res.member_ids ?? 0 };
}

/** Set your own BSA member ID (My family). */
export async function saveMyMemberId(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireMember();
  const id = String(form.get("member_id") ?? "").replace(/[\s-]/g, "");
  if (id && !MEMBER_ID.test(id)) return { error: "A member ID is digits only, up to 12." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_member_id", { p_member_id: id });
  if (error) {
    if (error.code === "23505") return { error: "That member ID is on another adult's record. Ask a pack admin." };
    return { error: "Couldn't save that." };
  }
  revalidatePath("/family");
  revalidatePath("/leaders/training");
  return { ok: true, message: id ? "Member ID saved" : "Member ID removed" };
}

/**
 * EXPERIMENTAL: read everyone's training straight from my.scouting (src/lib/myscouting.ts). Only
 * when the my.scouting login is set in Vercel. Returns rows for the same preview as an upload;
 * nothing changes until the leader applies them.
 */
export async function fetchFromMyScouting(): Promise<SyncResult> {
  const me = await requireMember();
  if (!isCommittee(me)) return { rows: [], steps: [], error: "Only pack leadership can do this." };
  return fetchMyScoutingTraining();
}
