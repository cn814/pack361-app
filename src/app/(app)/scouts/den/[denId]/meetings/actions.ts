"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/ActionForm";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/data";
import { getCatalog, getRecords } from "@/lib/advancement-data";
import { getMeeting, leadsDen, todayEastern } from "@/lib/meetings";
import type { DenRank } from "@/lib/types";

const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

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

  const row = {
    den_id: denId,
    meets_on: meetsOn,
    title,
    rank,
    adventure: adv?.name ?? null,
    requirements: [...new Set(reqs)].sort((a, b) => Number(a) - Number(b)),
    location: String(form.get("location") ?? "").trim().slice(0, 120) || null,
    family_note: String(form.get("family_note") ?? "").trim().slice(0, 500) || null,
  };
  if (id) {
    const { error } = await supabase.from("den_meetings").update(row).eq("id", id);
    if (error) return { error: "Couldn't save the meeting." };
    revalidatePath(`/scouts/den/${denId}/meetings`, "layout");
    return { ok: true };
  }
  const { data, error } = await supabase
    .from("den_meetings")
    .insert({ ...row, created_by: me.id })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't save the meeting." };
  revalidatePath(`/scouts/den/${denId}/meetings`);
  redirect(`/scouts/den/${denId}/meetings/${data.id}`);
}

export async function deleteMeeting(form: FormData) {
  const me = await requireMember();
  const id = String(form.get("id") ?? "");
  const denId = String(form.get("den_id") ?? "");
  if (!(await leadsDen(me, denId))) return;
  const supabase = await createClient();
  await supabase.from("den_meetings").delete().eq("id", id);
  revalidatePath(`/scouts/den/${denId}/meetings`);
  redirect(`/scouts/den/${denId}/meetings`);
}

export async function saveAttendance(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const meetingId = String(form.get("meeting_id") ?? "");
  const meeting = UUID.test(meetingId) ? await getMeeting(meetingId) : null;
  if (!meeting || !(await leadsDen(me, meeting.den_id))) return { error: "Meeting not found." };
  const present = new Set(form.getAll("present").map(String).filter((s) => UUID.test(s)));
  const before = new Set((meeting.attendance ?? []).map((a) => a.scout_id));

  const supabase = await createClient();
  const gone = [...before].filter((s) => !present.has(s));
  const added = [...present].filter((s) => !before.has(s));
  if (gone.length) await supabase.from("den_meeting_attendance").delete().eq("meeting_id", meetingId).in("scout_id", gone);
  if (added.length) {
    const { error } = await supabase
      .from("den_meeting_attendance")
      .insert(added.map((scout_id) => ({ meeting_id: meetingId, scout_id })));
    if (error) return { error: "Couldn't save attendance." };
  }
  revalidatePath(`/scouts/den/${meeting.den_id}/meetings`, "layout");
  return { ok: true, message: `Attendance saved: ${present.size} here.` };
}

/**
 * Report the meeting's requirements for every scout marked present, already approved
 * (the den leader was there). Skips anything Scoutbook or the app already has.
 */
export async function recordMeeting(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const meetingId = String(form.get("meeting_id") ?? "");
  const meeting = UUID.test(meetingId) ? await getMeeting(meetingId) : null;
  if (!meeting || !(await leadsDen(me, meeting.den_id))) return { error: "Meeting not found." };
  if (!meeting.adventure || !meeting.requirements.length) return { error: "Pick the adventure and requirements covered first." };
  if (meeting.meets_on > todayEastern()) return { error: "You can report requirements on or after the meeting date." };
  const scoutIds = (meeting.attendance ?? []).map((a) => a.scout_id);
  if (!scoutIds.length) return { error: "Mark who was there first." };

  const supabase = await createClient();
  const [records, { data: subs }] = await Promise.all([
    getRecords(scoutIds),
    supabase
      .from("advancement_submissions")
      .select("scout_id, adventure, requirement, status")
      .in("scout_id", scoutIds)
      .eq("adventure", meeting.adventure)
      .neq("status", "returned"),
  ]);
  const adv = meeting.adventure.toLowerCase();
  const done = (scoutId: string, req: string) =>
    records.some(
      (r) =>
        r.scout_id === scoutId &&
        (r.adventure ?? "").toLowerCase() === adv &&
        (r.kind === "adventure" || (r.kind === "requirement" && (r.item === req || r.item.replace(/\D.*$/, "") === req))),
    ) || (subs ?? []).some((s) => s.scout_id === scoutId && s.requirement === req);

  const rows = scoutIds.flatMap((scout_id) =>
    meeting.requirements
      .filter((req) => !done(scout_id, req))
      .map((requirement) => ({
        scout_id,
        submitted_by: me.id,
        rank: meeting.rank,
        adventure: meeting.adventure!,
        requirement,
        completed_on: meeting.meets_on,
        notes: `Den meeting: ${meeting.title}`,
        status: "approved",
        meeting_id: meeting.id,
      })),
  );
  if (rows.length) {
    const { error } = await supabase.from("advancement_submissions").insert(rows);
    if (error) return { error: "Couldn't report those requirements." };
  }
  await supabase.from("den_meetings").update({ recorded_at: new Date().toISOString(), recorded_by: me.id }).eq("id", meeting.id);
  revalidatePath("/scouts", "layout");
  const skipped = scoutIds.length * meeting.requirements.length - rows.length;
  return {
    ok: true,
    message: `Reported ${rows.length} requirement${rows.length === 1 ? "" : "s"} for ${scoutIds.length} scout${scoutIds.length === 1 ? "" : "s"}${
      skipped ? ` (${skipped} already done, skipped)` : ""
    }. They're on the advancement chair's list to enter in Scoutbook.`,
  };
}
