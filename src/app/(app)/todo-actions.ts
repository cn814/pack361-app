"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { eventPath } from "@/lib/featured";

const UUID = /^[0-9a-f-]{36}$/i;
const HIDE_KEY = /^((poll|job)-[0-9a-f-]{36}|training-import)$/i;

/**
 * Answer an RSVP straight from a to-do. Going counts the family's scouts the event is for (all
 * of them for a pack-wide event) and one adult; the event page is there to change the numbers.
 * Going to an event that costs money opens the event instead, since the counts set the price.
 */
export async function quickRsvp(form: FormData) {
  const me = await requireMember();
  const id = String(form.get("event_id") ?? "");
  const status = String(form.get("status") ?? "");
  if (!UUID.test(id) || !["yes", "maybe", "no"].includes(status)) return;
  const supabase = await createClient();
  const { data: e } = await supabase
    .from("events")
    .select("id, category, den_id, ranks, fee_family_cents, fee_scout_cents, fee_adult_cents")
    .eq("id", id)
    .maybeSingle();
  if (!e) return;
  const paid = e.fee_family_cents != null || e.fee_scout_cents != null || e.fee_adult_cents != null;
  if (status === "yes" && paid) redirect(`${eventPath(e as { id: string; category: string })}#rsvp`);

  let scouts = 0;
  if (status !== "no" && me.family_id) {
    const { data: kids } = await supabase.from("scouts").select("den_id, den:dens(rank)").eq("family_id", me.family_id).eq("is_active", true);
    const list = (kids ?? []) as unknown as { den_id: string | null; den: { rank: string } | null }[];
    const ranks = (e.ranks as string[] | null) ?? [];
    const forEvent = list.filter((k) => (e.den_id ? k.den_id === e.den_id : ranks.length ? ranks.includes(k.den?.rank ?? "") : true));
    scouts = (forEvent.length ? forEvent : list).length;
  }
  const { error } = await supabase.rpc("set_rsvp", {
    p_event_id: id,
    p_status: status,
    p_scouts: status === "no" ? 0 : scouts,
    p_adults: status === "no" ? 0 : 1,
    p_note: "",
  });
  revalidatePath("/", "layout");
  // The to-do's buttons are a plain form with nowhere to show a message, so (like a paid event
  // above) open the event's RSVP card: it says when RSVPs are closed, and its form reports
  // any other problem if they try again there.
  if (error) redirect(`${eventPath(e as { id: string; category: string })}#rsvp`);
}

/** "Not now": hide a poll or volunteer job from Home and the bell until `until` (or for good). */
export async function hideTodo(form: FormData) {
  await requireMember();
  const keys = form.getAll("key").map(String).filter((k) => HIDE_KEY.test(k)).slice(0, 20);
  const untils = form.getAll("until").map(String);
  if (!keys.length) return;
  const supabase = await createClient();
  await supabase.from("todo_dismissals").upsert(
    keys.map((key, i) => {
      const u = untils[i] ?? "";
      return { key, hidden_until: u && !Number.isNaN(Date.parse(u)) ? new Date(u).toISOString() : null };
    }),
    { onConflict: "adult_id,key" },
  );
  revalidatePath("/", "layout");
}
