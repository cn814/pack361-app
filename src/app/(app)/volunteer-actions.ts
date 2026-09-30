"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/ActionForm";
import { createClient } from "@/lib/supabase/server";
import { isLeader, requireMember } from "@/lib/data";

const UUID = /^[0-9a-f-]{36}$/i;

function refresh(eventId: string) {
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/campouts/${eventId}`);
  revalidatePath("/");
}

export async function volunteerSignUp(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const slotId = String(form.get("slot_id") ?? "");
  const eventId = String(form.get("event_id") ?? "");
  if (!UUID.test(slotId)) return { error: "Unknown job." };
  const supabase = await createClient();
  const { error } = await supabase.from("volunteer_signups").insert({ slot_id: slotId, adult_id: me.id });
  if (error) {
    if (/full/i.test(error.message)) return { error: "Someone just took the last spot." };
    if (/duplicate|pkey/i.test(error.message)) return { ok: true, message: "You're already signed up." };
    return { error: "Couldn't sign you up. Try again." };
  }
  refresh(eventId);
  return { ok: true, message: "Thanks! You'll get a reminder the day before." };
}

export async function volunteerCancel(form: FormData) {
  const me = await requireMember();
  const supabase = await createClient();
  const adultId = String(form.get("adult_id") ?? me.id);
  // RLS: yourself, or anyone if you're a leader
  await supabase.from("volunteer_signups").delete().eq("slot_id", String(form.get("slot_id"))).eq("adult_id", adultId);
  refresh(String(form.get("event_id")));
}

export async function addVolunteerSlot(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  if (!isLeader(me)) return { error: "Only leaders can add jobs." };
  const eventId = String(form.get("event_id") ?? "");
  const title = String(form.get("role_title") ?? "").trim().slice(0, 80);
  const capacity = Number(form.get("capacity") ?? 1);
  if (!UUID.test(eventId)) return { error: "Unknown event." };
  if (!title) return { error: "Name the job, e.g. \"Saturday breakfast cook\"." };
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) return { error: "People needed should be 1 to 50." };
  const supabase = await createClient();
  const { error } = await supabase.from("volunteer_slots").insert({
    event_id: eventId,
    role_title: title,
    shift_label: String(form.get("shift_label") ?? "").trim().slice(0, 60) || null,
    capacity,
    is_urgent: form.get("is_urgent") === "on",
    notes: String(form.get("notes") ?? "").trim().slice(0, 300) || null,
  });
  if (error) return { error: "Couldn't add that job." };
  refresh(eventId);
  return { ok: true, message: "Job added" };
}

export async function deleteVolunteerSlot(form: FormData) {
  const me = await requireMember();
  if (!isLeader(me)) return;
  const supabase = await createClient();
  await supabase.from("volunteer_slots").delete().eq("id", String(form.get("slot_id")));
  refresh(String(form.get("event_id")));
}
