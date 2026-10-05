"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/ActionForm";
import { isLeader, requireMember } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Save the leader notes for an event, or for a den's meeting on a day (the database checks who). */
export async function saveMeetingNotes(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return save(form, true);
}

async function save(form: FormData, retry: boolean): Promise<ActionResult> {
  const me = await requireMember();
  if (!isLeader(me)) return { error: "Only leaders keep meeting notes." };
  const eventId = String(form.get("event_id") ?? "");
  const denId = String(form.get("den_id") ?? "");
  const day = String(form.get("day") ?? "");
  const body = String(form.get("body") ?? "").replace(/\r\n/g, "\n").trimEnd();
  if (body.length > 20000) return { error: "That's too long to save (20,000 characters at most)." };
  const target = UUID.test(eventId) ? { event_id: eventId } : UUID.test(denId) && DAY.test(day) ? { den_id: denId, meets_on: day } : null;
  if (!target) return { error: "Unknown meeting." };

  const supabase = await createClient();
  let q = supabase.from("meeting_notes").update({ body }).select("id");
  q = "event_id" in target ? q.eq("event_id", target.event_id) : q.eq("den_id", target.den_id).eq("meets_on", target.meets_on);
  const { data: updated, error: updateError } = await q;
  if (updateError) return { error: "Couldn't save the notes. Try again." };
  if (!updated?.length) {
    const { error } = await supabase.from("meeting_notes").insert({ ...target, body });
    // Two leaders saving the first notes at once: the other one got there first, so add to theirs.
    if (error && retry && /duplicate|unique/i.test(error.message)) return save(form, false);
    if (error) return { error: /row-level|permission/i.test(error.message) ? "Only this meeting's leaders can keep its notes." : "Couldn't save the notes. Try again." };
  }
  if ("event_id" in target) {
    revalidatePath(`/events/${target.event_id}`);
    revalidatePath(`/campouts/${target.event_id}`);
  } else {
    revalidatePath(`/scouts/den/${target.den_id}/today`);
  }
  return { ok: true, message: "Notes saved." };
}
