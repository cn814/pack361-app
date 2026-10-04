"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isCommittee, isLeader, requireMember } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { easternToIso } from "@/lib/calendar";
import type { ActionResult } from "@/components/ActionForm";
import { parseDollars } from "@/lib/money";
import { signalLinkFrom } from "@/lib/event-signal";
import { afterRsvpChange, rsvpFullMessage } from "@/lib/waitlist";
import { MAX_REPEATS, REPEATS, repeatDates, shiftDate, type Repeat } from "@/lib/event-builder";
import { addDays, daysBetween } from "@/lib/tz";

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
  const { error } = await supabase.from("events").update(patch).eq("id", id);
  // Plain form action (no result to show): throw so the error page says it didn't save,
  // instead of redirecting as if it had.
  if (error) throw new Error(archive ? "Couldn't archive the event." : "Couldn't put the event back.");
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

  // Permission slip: the wording families agree to, an optional printable form, a due date.
  const slipRequired = form.get("slip_required") === "on";
  const slipDoc = String(form.get("slip_document_id") ?? "");
  const slipDue = String(form.get("slip_due") ?? "");
  if (slipRequired && !text("slip_text", 4000)) return { error: "Add the permission slip wording families agree to." };
  if (slipRequired && slipDue && (!DATE.test(slipDue) || slipDue > endDate)) return { error: "The permission slip due date should be on or before the event." };

  // Start and end for an event starting on `day` (the first one, or a later one in a series:
  // the end keeps the same number of days after the start).
  const timesOn = (day: string) => {
    const end = addDays(endDate, daysBetween(startDate, day));
    const starts_at = easternToIso(day, allDay ? "00:00" : startTime);
    let ends_at: string | null = null;
    if (allDay) ends_at = end !== day ? easternToIso(end, "00:00") : null;
    else if (endTime) ends_at = easternToIso(end, endTime);
    else if (end !== day) ends_at = easternToIso(end, "23:59");
    return { starts_at, ends_at };
  };
  const { starts_at, ends_at } = timesOn(startDate);
  if (ends_at && ends_at < starts_at) return { error: "The event ends before it starts." };

  // RSVP limit: at most this many people (scouts and adults); blank = no limit.
  const limitRaw = String(form.get("rsvp_limit") ?? "").trim();
  if (limitRaw && !/^\d{1,3}$/.test(limitRaw)) return { error: "The limit should be a number of people from 1 to 500, or blank." };
  const rsvpLimit = limitRaw ? Number(limitRaw) : null;
  if (rsvpLimit !== null && (rsvpLimit < 1 || rsvpLimit > 500)) return { error: "The limit should be a number of people from 1 to 500, or blank." };

  // Repeats (new events only): one event per date, linked as a series.
  const repeatRaw = String(form.get("repeat") ?? "never");
  const repeat: Repeat = !UUID.test(id) && (REPEATS as string[]).includes(repeatRaw) ? (repeatRaw as Repeat) : "never";
  const until = String(form.get("repeat_until") ?? "");
  let dates = [startDate];
  if (repeat !== "never") {
    if (!DATE.test(until)) return { error: "Pick the date it repeats until." };
    if (until <= startDate) return { error: "The “until” date should be after the first date." };
    dates = repeatDates(startDate, repeat, until);
    if (dates.length > MAX_REPEATS) return { error: `That's more than ${MAX_REPEATS} events. Pick an earlier “until” date.` };
    if (dates.length < 2) return { error: "It doesn't repeat before the “until” date. Pick a later one." };
  }

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
    public_on_join: form.get("public_on_join") === "on",
    public_blurb: form.get("public_on_join") === "on" ? text("public_blurb", 300) : null,
    slip_required: slipRequired,
    slip_text: slipRequired ? text("slip_text", 4000) : null,
    slip_document_id: slipRequired && UUID.test(slipDoc) ? slipDoc : null,
    slip_due: slipRequired && DATE.test(slipDue) ? slipDue : null,
    rsvp_limit: form.get("rsvp_enabled") === "on" ? rsvpLimit : null,
    carpool: form.get("carpool") === "on" ? true : form.get("carpool") === "off" ? false : null,
    ...fees,
  };
  const supabase = await createClient();
  let eventId = id;
  let seriesNote = "";
  if (UUID.test(id)) {
    const { error } = await withoutMissingLimit(row, (r) => supabase.from("events").update({ ...r, source: "manual" }).eq("id", id));
    if (error) return { error: "Couldn't save the event." };
    // Also change the other upcoming events in the series: name, time, place and details.
    if (form.get("apply_series") === "on") {
      const { error: seriesError } = await supabase.rpc("apply_to_series", { p_event_id: id });
      if (seriesError) seriesNote = "This event was saved, but the other events in the series couldn't be changed. Save again to retry.";
    }
  } else {
    const seriesId = dates.length > 1 ? crypto.randomUUID() : null;
    const rows = dates.map((day) => ({
      ...row,
      ...timesOn(day),
      rsvp_by: shiftDate(row.rsvp_by, startDate, day),
      slip_due: shiftDate(row.slip_due, startDate, day),
      series_id: seriesId,
      source: "manual",
      created_by: me.id,
    }));
    const { data, error } = await withoutMissingLimit(rows, (r) => supabase.from("events").insert(r).select("id, starts_at"));
    if (error || !data?.length) return { error: dates.length > 1 ? "Couldn't add the events." : "Couldn't add the event." };
    eventId = [...data].sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))[0].id as string;
  }
  // Bring families' event charges in line with the (new) cost. Paid ones stay as they are.
  // (Leadership only: den leaders can't change prices, and the database refuses them this.)
  // The real role, not the "View as" one: the database checks the real one.
  if (UUID.test(id) && isCommittee({ ...me, role: me.real_role ?? me.role })) {
    const { error } = await supabase.rpc("refresh_event_charges", { p_event_id: eventId });
    if (error) {
      revalidatePath("/", "layout");
      return { error: "The event was saved, but families' charges for it couldn't be updated to the new cost. Save again to retry." };
    }
  }
  revalidatePath("/", "layout");
  if (seriesNote) return { error: seriesNote };
  if (UUID.test(id)) afterRsvpChange(eventId); // a raised or removed RSVP limit may let waitlisted families in
  redirect(category === "Campout" ? `/campouts/${eventId}` : `/events/${eventId}`);
}

/**
 * Runs a save; if the database doesn't have the RSVP limit column yet (it comes with the RSVP
 * waitlist update), saves again without it rather than failing.
 */
async function withoutMissingLimit<R extends { rsvp_limit?: number | null }, T extends { error: { message: string } | null }>(
  rows: R | R[],
  save: (rows: R | R[]) => PromiseLike<T>,
): Promise<T> {
  const first = await save(rows);
  if (!first.error || !/rsvp_limit/.test(first.error.message)) return first;
  const strip = (r: R) => {
    const rest = { ...r };
    delete rest.rsvp_limit;
    return rest;
  };
  return save(Array.isArray(rows) ? rows.map(strip) : strip(rows));
}

/** Leaders: set, change or remove the event's Signal group link (blank removes it). */
export async function saveEventSignal(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  if (!isLeader(me)) return { error: "Only leaders can change the Signal group." };
  const id = String(form.get("event_id") ?? "");
  if (!UUID.test(id)) return { error: "Event not found." };
  const raw = String(form.get("url") ?? "").slice(0, 2000);
  const supabase = await createClient();
  if (form.get("remove") === "1" || !raw.trim()) {
    const { error } = await supabase.from("event_signal").delete().eq("event_id", id);
    if (error) return { error: "Couldn't remove the Signal group." };
  } else {
    const url = signalLinkFrom(raw);
    if (!url) return { error: "That isn't a Signal group link. In Signal, open the group, tap its name, then Group link, and share or copy it. It starts with https://signal.group/#" };
    const { error } = await supabase
      .from("event_signal")
      .upsert({ event_id: id, url, updated_at: new Date().toISOString(), updated_by: me.id }, { onConflict: "event_id" });
    if (error) return { error: "Couldn't save the Signal group." };
  }
  revalidatePath(`/events/${id}`);
  revalidatePath(`/campouts/${id}`);
  return { ok: true, message: form.get("remove") === "1" || !raw.trim() ? "Signal group removed." : "Saved. Families who RSVP yes will see Join the Signal group." };
}

/** Answer (or change) the family's RSVP. */
export async function setRsvp(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
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
  if (error)
    return {
      error: rsvpFullMessage(error) ?? (error.message.includes("closed") ? "RSVPs for this event are closed. Contact a leader." : "Couldn't save your RSVP."),
    };
  afterRsvpChange(id); // a "no" or fewer people may let waitlisted families in: tell them
  revalidatePath("/", "layout");
  if (status === "no") return { ok: true, message: "Thanks for letting us know." };
  // A full event puts the family on the waitlist: say so instead of "you're on the list".
  // Leaders can read every family's answer, so pick out this family's (or this adult's) own.
  const mineQ = supabase.from("event_rsvps").select("waitlisted").eq("event_id", id).eq("status", "yes");
  const { data: mine } = await (me.family_id ? mineQ.eq("family_id", me.family_id) : mineQ.is("family_id", null).eq("adult_id", me.id)).maybeSingle();
  if ((mine as { waitlisted?: boolean } | null)?.waitlisted)
    return { ok: true, message: "The event is full, so you're on the waitlist. We'll send you an alert if a spot opens up." };
  return { ok: true, message: "Thanks, you're on the list. You can change your answer until RSVPs close." };
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

// ---------------------------------------------------------------------------
// Permission slips
// ---------------------------------------------------------------------------
function slipPaths(eventId: string) {
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/campouts/${eventId}`);
  revalidatePath("/", "layout");
}

/** A parent signs for one or more of their scouts by typing their name. */
export async function signSlips(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireMember();
  const eventId = String(form.get("event_id") ?? "");
  const scouts = form.getAll("scout_id").map(String).filter((x) => UUID.test(x)).slice(0, 10);
  const name = String(form.get("signed_name") ?? "").trim().slice(0, 120);
  const contact = String(form.get("contact") ?? "").trim().slice(0, 200) || null;
  if (!UUID.test(eventId)) return { error: "Unknown event." };
  if (!scouts.length) return { error: "Tick the scouts you're signing for." };
  if (form.get("agree") !== "on") return { error: "Tick the box to agree." };
  if (name.length < 2) return { error: "Type your full name to sign." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("permission_slips")
    .insert(scouts.map((scout_id) => ({ event_id: eventId, scout_id, kind: "signed", signed_name: name, contact })));
  if (error) {
    if (/duplicate key|permission_slips_event_id_scout_id_key/i.test(error.message)) return { error: "Already signed. Reload the page." };
    if (/over/i.test(error.message)) return { error: "This event is over." };
    return { error: "Couldn't sign. Try again." };
  }
  slipPaths(eventId);
  return { ok: true, message: "Signed. Thank you!" };
}

/** A parent takes back their signature (to fix it); leaders remove any slip. */
export async function removeSlip(form: FormData) {
  await requireMember();
  const id = String(form.get("id") ?? "");
  const eventId = String(form.get("event_id") ?? "");
  if (!UUID.test(id) || !UUID.test(eventId)) return;
  const supabase = await createClient();
  await supabase.from("permission_slips").delete().eq("id", id);
  slipPaths(eventId);
}

/** Leaders: a paper slip came in. */
export async function recordPaperSlip(form: FormData) {
  const me = await requireMember();
  if (!isLeader(me)) return;
  const eventId = String(form.get("event_id") ?? "");
  const scoutId = String(form.get("scout_id") ?? "");
  if (!UUID.test(eventId) || !UUID.test(scoutId)) return;
  const supabase = await createClient();
  await supabase.from("permission_slips").insert({ event_id: eventId, scout_id: scoutId, kind: "paper" });
  slipPaths(eventId);
}
