"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/ActionForm";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/data";

const UUID = /^[0-9a-f-]{36}$/i;

function clean(form: FormData, key: string, max: number): string | null {
  const v = String(form.get(key) ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return v || null;
}

function refresh(eventId: string) {
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/campouts/${eventId}`);
}

/** Post or change the family's carpool post for an event (one per family). */
export async function saveCarpool(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const eventId = String(form.get("event_id") ?? "");
  if (!UUID.test(eventId)) return { error: "Event not found." };
  const kind = form.get("kind") === "need" ? "need" : form.get("kind") === "offer" ? "offer" : null;
  if (!kind) return { error: "Pick whether you have seats or need a ride." };
  const seats = Number(form.get("seats") ?? 1);
  if (!Number.isInteger(seats) || seats < 1 || seats > 8) return { error: "Seats should be a number from 1 to 8." };
  const row = {
    kind,
    seats,
    leaving_from: clean(form, "leaving_from", 80),
    contact: clean(form, "contact", 120),
    note: clean(form, "note", 300),
    adult_id: me.id,
    family_id: me.family_id,
  };
  const supabase = await createClient();
  const existing = supabase.from("event_carpools").select("id").eq("event_id", eventId);
  const { data: mine } = await (me.family_id ? existing.eq("family_id", me.family_id) : existing.is("family_id", null).eq("adult_id", me.id)).maybeSingle();
  const { error } = mine
    ? await supabase.from("event_carpools").update(row).eq("id", (mine as { id: string }).id)
    : await supabase.from("event_carpools").insert({ ...row, event_id: eventId });
  if (error) return { error: "Couldn't save your carpool post. Try again." };
  refresh(eventId);
  return { ok: true, message: kind === "offer" ? "Posted. Families who need a ride can reach out." : "Posted. Drivers with seats can reach out." };
}

/** Take down a carpool post: your family's own, or (leaders) anyone's. */
export async function removeCarpool(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireMember();
  const id = String(form.get("id") ?? "");
  const eventId = String(form.get("event_id") ?? "");
  if (!UUID.test(id) || !UUID.test(eventId)) return { error: "Post not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("event_carpools").delete().eq("id", id).select("id");
  if (error || !data?.length) return { error: "Couldn't remove that post." };
  refresh(eventId);
  return { ok: true, message: "Removed." };
}
