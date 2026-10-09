"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/ActionForm";
import { requireMember } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;

/** Save my notepad, or my notes for one meeting. Only I can read them (the database checks). */
export async function saveMyNote(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return save(form, true);
}

async function save(form: FormData, retry: boolean): Promise<ActionResult> {
  const me = await requireMember();
  const raw = String(form.get("event_id") ?? "");
  const eventId = UUID.test(raw) ? raw : null;
  if (raw && !eventId) return { error: "Unknown meeting." };
  const body = String(form.get("body") ?? "").replace(/\r\n/g, "\n").trimEnd();
  if (body.length > 50000) return { error: "That's too long to save (50,000 characters at most)." };

  const supabase = await createClient();
  let q = supabase.from("my_notes").update({ body }).eq("adult_id", me.id).select("id");
  q = eventId ? q.eq("event_id", eventId) : q.is("event_id", null);
  const { data: updated, error: updateError } = await q;
  if (updateError) return { error: "Couldn't save your notes. Try again." };
  if (!updated?.length) {
    const { error } = await supabase.from("my_notes").insert({ adult_id: me.id, event_id: eventId, body });
    // Saved from two tabs at once: the other one made the row, so save into it.
    if (error && retry && /duplicate|unique/i.test(error.message)) return save(form, false);
    if (error) return { error: "Couldn't save your notes. Try again." };
  }
  revalidatePath("/family/notes");
  if (eventId) revalidatePath(`/events/${eventId}`);
  return { ok: true, message: "Saved. Only you can see these." };
}
