"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/ActionForm";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/data";
import { getCatalog } from "@/lib/advancement-data";
import { leadsDen, todayEastern, type MeetingWork } from "@/lib/meetings";
import type { DenRank } from "@/lib/types";

const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Plan a meeting ahead of time (optional): date, place, and the adventure it will work on. */
export async function saveMeeting(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const id = String(form.get("id") ?? "");
  const denId = String(form.get("den_id") ?? "");
  if (!UUID.test(denId) || !(await leadsDen(me, denId))) return { error: "You can only plan meetings for your own den." };

  const supabase = await createClient();
  const { data: den } = await supabase.from("dens").select("rank").eq("id", denId).maybeSingle();
  const rank = (den?.rank ?? null) as DenRank | null;
  const meetsOn = String(form.get("meets_on") ?? "");
  const adventure = String(form.get("adventure") ?? "").trim();
  const catalog = await getCatalog();
  const adv = adventure ? catalog.find((a) => a.rank === rank && a.name === adventure) : null;
  if (adventure && !adv) return { error: "Pick an adventure from the list." };
  const reqs = form
    .getAll("requirement")
    .map(String)
    .filter((r) => adv && /^\d{1,2}$/.test(r) && Number(r) >= 1 && Number(r) <= adv.req_count);
  const title = String(form.get("title") ?? "").trim().slice(0, 100) || adventure || "Den meeting";
  if (!DATE.test(meetsOn)) return { error: "Pick the meeting date." };

  const requirements = [...new Set(reqs)].sort((a, b) => Number(a) - Number(b));
  // The first adventure is set here; recording the meeting can add more.
  const first = adv && requirements.length ? { adventure: adv.name, requirements } : null;
  const row = {
    den_id: denId,
    meets_on: meetsOn,
    title,
    rank,
    location: String(form.get("location") ?? "").trim().slice(0, 120) || null,
    address: String(form.get("address") ?? "").trim().slice(0, 200) || null,
    start_time: /^\d{2}:\d{2}(:\d{2})?$/.test(String(form.get("start_time") ?? "")) ? String(form.get("start_time")) : null,
    end_time: /^\d{2}:\d{2}(:\d{2})?$/.test(String(form.get("end_time") ?? "")) ? String(form.get("end_time")) : null,
    family_note: String(form.get("family_note") ?? "").trim().slice(0, 500) || null,
  };
  if (id) {
    // Only the first adventure: the database keeps any others the meeting already has in work.
    const { error } = await supabase
      .from("den_meetings")
      .update({ ...row, adventure: first?.adventure ?? null, requirements: first?.requirements ?? [] })
      .eq("id", id);
    if (error) return { error: "Couldn't save the meeting." };
    revalidatePath(`/scouts/den/${denId}`, "layout");
    return { ok: true };
  }
  const { data, error } = await supabase
    .from("den_meetings")
    .insert({ ...row, work: first ? [first] : [], created_by: me.id })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't save the meeting." };
  revalidatePath(`/scouts/den/${denId}`, "layout");
  redirect(`/scouts/den/${denId}/meetings/${data.id}`);
}

export async function deleteMeeting(form: FormData) {
  const me = await requireMember();
  const id = String(form.get("id") ?? "");
  const denId = String(form.get("den_id") ?? "");
  if (!(await leadsDen(me, denId))) return;
  const supabase = await createClient();
  await supabase.from("den_meetings").delete().eq("id", id);
  revalidatePath(`/scouts/den/${denId}`, "layout");
  redirect(`/scouts/den/${denId}/meetings`);
}

export type RecordResult = ActionResult & {
  meetingId?: string;
  /** Already entered in Scoutbook, so not undone here. */
  entered?: { scout: string; adventure: string; requirement: string }[];
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The one Save on the record page: who was here and what they did. Records the requirements for
 * every scout here (approved, on the Scoutbook list) and removes what this meeting added earlier
 * that's no longer checked, unless it's already in Scoutbook. Saving twice changes nothing.
 */
export async function recordDenMeeting(_prev: RecordResult, form: FormData): Promise<RecordResult> {
  const me = await requireMember();
  const denId = String(form.get("den_id") ?? "");
  const meetingId = String(form.get("meeting_id") ?? "");
  const meetsOn = String(form.get("meets_on") ?? "");
  if (!UUID.test(denId) || !(await leadsDen(me, denId))) return { error: "Only this den's leaders can save its meetings." };
  if (!DATE.test(meetsOn)) return { error: "Pick the meeting day." };
  if (meetsOn > todayEastern()) return { error: "You can save a meeting on the day or after, not ahead of time." };
  const present = [...new Set(form.getAll("present").map(String).filter((s) => UUID.test(s)))];
  let work: MeetingWork[] = [];
  try {
    const raw = JSON.parse(String(form.get("work") ?? "[]"));
    if (Array.isArray(raw)) work = raw;
  } catch {
    return { error: "Something went wrong. Reload the page and try again." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_den_meeting", {
    p_den_id: denId,
    p_meeting_id: UUID.test(meetingId) ? meetingId : null,
    p_meets_on: meetsOn,
    p_present: present,
    p_work: work,
  });
  if (error || !data) return { error: "Couldn't save. Check your connection and tap Save again; nothing will be doubled." };
  const r = data as {
    meeting_id: string;
    present: number;
    requirements: number;
    on_list: number;
    added: number;
    removed: number;
    already_done: number;
    entered: { scout: string; adventure: string; requirement: string }[];
  };
  revalidatePath("/", "layout");

  const parts = [`Saved. ${plural(r.present, "scout")} here.`];
  if (r.requirements > 0) {
    parts[0] = `Saved. ${plural(r.present, "scout")} × ${plural(r.requirements, "requirement")} recorded.`;
    parts.push(r.on_list > 0 ? "The advancement chair will enter them in Scoutbook." : "Nothing new for the Scoutbook list.");
    if (r.already_done > 0) parts.push(`${r.already_done} already done before, so skipped.`);
  }
  if (r.removed > 0) parts.push(`Took ${r.removed} off the Scoutbook list.`);
  return { ok: true, message: parts.join(" "), meetingId: r.meeting_id, entered: r.entered ?? [] };
}
