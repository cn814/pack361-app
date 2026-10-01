"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isLeader, requireMember } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { easternToIso } from "@/lib/calendar";
import type { ActionResult } from "@/components/ActionForm";
import { parseDollars } from "@/lib/money";

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

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const RANKS = ["lion", "tiger", "wolf", "bear", "webelos", "aol"];

/**
 * Leaders: add or edit an event. Editing an event that came from TroopWebHost makes it the
 * app's own (source "manual"), so the TroopWebHost sync no longer changes it.
 */
export async function saveEvent(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  if (!isLeader(me)) return { error: "Only leaders can add or change events." };
  const id = String(form.get("id") ?? "");
  const text = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max) || null;
  const title = text("title", 200);
  const category = text("category", 40) ?? "Pack";
  const startDate = String(form.get("start_date") ?? "");
  const endDate = String(form.get("end_date") ?? "") || startDate;
  const allDay = form.get("all_day") === "on";
  const startTime = String(form.get("start_time") ?? "");
  const endTime = String(form.get("end_time") ?? "");
  const denId = String(form.get("den_id") ?? "");
  const ranks = form.getAll("ranks").map(String).filter((r) => RANKS.includes(r));
  const signup = text("signup_url", 500);
  const rsvpBy = String(form.get("rsvp_by") ?? "");
  const nightsRaw = String(form.get("camping_nights") ?? "").trim();

  if (!title) return { error: "Give the event a name." };
  if (!DATE.test(startDate)) return { error: "Pick the date." };
  if (!DATE.test(endDate) || endDate < startDate) return { error: "The end date can't be before the start date." };
  if (!allDay && !TIME.test(startTime)) return { error: "Pick a start time, or tick All day." };
  if (!allDay && endTime && !TIME.test(endTime)) return { error: "Pick an end time." };
  if (signup && !/^https:\/\//i.test(signup)) return { error: "The sign-up link should start with https://" };
  if (rsvpBy && !DATE.test(rsvpBy)) return { error: "Pick the RSVP deadline." };
  // Camping nights: blank = work it out from the dates.
  if (nightsRaw && !/^\d{1,2}$/.test(nightsRaw)) return { error: "Camping nights should be a number from 0 to 14, or blank." };
  const campingNights = nightsRaw ? Number(nightsRaw) : null;
  if (campingNights !== null && campingNights > 14) return { error: "Camping nights should be a number from 0 to 14, or blank." };

  // Cost: empty box = no charge of that kind.
  const hasCost = form.get("has_cost") === "on";
  const fees: Record<"fee_family_cents" | "fee_scout_cents" | "fee_adult_cents", number | null> = {
    fee_family_cents: null,
    fee_scout_cents: null,
    fee_adult_cents: null,
  };
  if (hasCost) {
    for (const [field, key] of [["fee_family", "fee_family_cents"], ["fee_scout", "fee_scout_cents"], ["fee_adult", "fee_adult_cents"]] as const) {
      const raw = String(form.get(field) ?? "").trim();
      if (!raw) continue;
      const cents = parseDollars(raw);
      if (cents === null) return { error: "Write the cost in dollars, like 25 or 12.50 (up to $1,000)." };
      fees[key] = cents;
    }
    if (fees.fee_family_cents === null && fees.fee_scout_cents === null && fees.fee_adult_cents === null) {
      return { error: "Add a price, or untick “This event costs money”." };
    }
  }

  const starts_at = easternToIso(startDate, allDay ? "00:00" : startTime);
  let ends_at: string | null = null;
  if (allDay) ends_at = endDate !== startDate ? easternToIso(endDate, "00:00") : null;
  else if (endTime) ends_at = easternToIso(endDate, endTime);
  else if (endDate !== startDate) ends_at = easternToIso(endDate, "23:59");
  if (ends_at && ends_at < starts_at) return { error: "The event ends before it starts." };

  const row = {
    title,
    category,
    starts_at,
    ends_at,
    all_day: allDay,
    location_name: text("location_name", 200),
    address: text("address", 300),
    details: text("details", 5000),
    signup_url: signup,
    den_id: UUID.test(denId) ? denId : null,
    ranks: !UUID.test(denId) && ranks.length ? ranks : null,
    rsvp_enabled: form.get("rsvp_enabled") === "on",
    rsvp_by: rsvpBy || null,
    camping_nights: campingNights,
    ...fees,
  };
  const supabase = await createClient();
  let eventId = id;
  if (UUID.test(id)) {
    const { error } = await supabase.from("events").update({ ...row, source: "manual" }).eq("id", id);
    if (error) return { error: "Couldn't save the event." };
  } else {
    const { data, error } = await supabase
      .from("events")
      .insert({ ...row, source: "manual", created_by: me.id })
      .select("id")
      .single();
    if (error || !data) return { error: "Couldn't add the event." };
    eventId = data.id as string;
  }
  // Bring families' event charges in line with the (new) cost. Paid ones stay as they are.
  if (UUID.test(id)) await supabase.rpc("refresh_event_charges", { p_event_id: eventId });
  revalidatePath("/", "layout");
  redirect(category === "Campout" ? `/campouts/${eventId}` : `/events/${eventId}`);
}

/** Answer (or change) the family's RSVP. */
export async function setRsvp(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireMember();
  const id = String(form.get("event_id") ?? "");
  const status = String(form.get("status") ?? "");
  if (!UUID.test(id)) return { error: "Event not found." };
  if (!["yes", "maybe", "no"].includes(status)) return { error: "Pick yes, maybe or no." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_rsvp", {
    p_event_id: id,
    p_status: status,
    p_scouts: Number(form.get("scouts") ?? 0) || 0,
    p_adults: Number(form.get("adults") ?? 0) || 0,
    p_note: String(form.get("note") ?? ""),
  });
  if (error) return { error: error.message.includes("closed") ? "RSVPs for this event are closed. Contact a leader." : "Couldn't save your RSVP." };
  revalidatePath("/", "layout");
  return { ok: true, message: status === "no" ? "Thanks for letting us know." : "Thanks, you're on the list. You can change your answer until RSVPs close." };
}

/** Leaders: save who was at an event (replaces the list). */
export async function recordEventAttendance(_prev: ActionResult, form: FormData): Promise<ActionResult & { count?: number }> {
  const me = await requireMember();
  if (!isLeader(me)) return { error: "Only leaders can take attendance." };
  const id = String(form.get("event_id") ?? "");
  if (!UUID.test(id)) return { error: "Event not found." };
  const scouts = [...new Set(form.getAll("scout").map(String).filter((s) => UUID.test(s)))];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_event_attendance", { p_event_id: id, p_scout_ids: scouts });
  if (error) {
    if (error.code === "22023") return { error: "You can take attendance on the day of the event or after." };
    if (error.code === "P0002") return { error: "Event not found." };
    return { error: "Couldn't save attendance. Try again." };
  }
  const count = Number(data ?? 0);
  revalidatePath(`/events/${id}`);
  revalidatePath(`/campouts/${id}`);
  revalidatePath("/leaders/attendance");
  return { ok: true, count, message: count === 1 ? "Saved: 1 scout was there." : `Saved: ${count} scouts were there.` };
}
