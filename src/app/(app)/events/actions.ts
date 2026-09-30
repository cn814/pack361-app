"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isLeader, requireMember } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;

/** Leaders: take an event off the calendar (it moves to the archive) or put it back. */
export async function setEventArchived(form: FormData) {
  const me = await requireMember();
  const id = String(form.get("id") ?? "");
  const archive = form.get("archive") === "1";
  const back = String(form.get("back") ?? "");
  if (!isLeader(me) || !UUID.test(id)) return;
  const supabase = await createClient();
  const { data: ev } = await supabase.from("events").select("source, archived_reason").eq("id", id).maybeSingle();
  if (!ev) return;
  const patch: Record<string, unknown> = archive
    ? { archived_at: new Date().toISOString(), archived_reason: "hidden" }
    : { archived_at: null, archived_reason: null };
  // Putting back an event that TroopWebHost removed: the app keeps it from now on, so the next
  // sync doesn't archive it again.
  if (!archive && ev.archived_reason === "removed_in_twh" && ev.source === "troopwebhost") patch.source = "manual";
  await supabase.from("events").update(patch).eq("id", id);
  revalidatePath("/", "layout");
  redirect(/^\/(?![\/\\])/.test(back) ? back : `/events/${id}`);
}
