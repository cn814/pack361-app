"use server";

import { revalidatePath } from "next/cache";
import { isCommittee, requireMember } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { COUNCIL_URL_KEY, FeedError, councilSummary, normalizeFeedUrl, syncCouncil } from "@/lib/council";
import type { ActionResult } from "@/components/ActionForm";

const UUID = /^[0-9a-f-]{36}$/i;
const RANKS = ["lion", "tiger", "wolf", "bear", "webelos", "aol"];

function refresh() {
  revalidatePath("/", "layout");
}

/** Run the check with the secret key and say what it did. */
async function runCheck(): Promise<ActionResult> {
  if (!adminConfigured()) return { error: "The app's Supabase secret key isn't set, so it can't check the council calendar." };
  try {
    const r = await syncCouncil(createAdminClient());
    refresh();
    if (r.off) return { error: councilSummary(r) };
    return r.ok ? { ok: true, message: councilSummary(r) } : { error: councilSummary(r) };
  } catch (e) {
    refresh();
    return { error: e instanceof FeedError ? e.message : "The check failed. The details are in the server log." };
  }
}

/** Committee: save the council calendar link, then check it. */
export async function saveCouncilLink(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  if (!isCommittee(me)) return { error: "Only the committee can change the council calendar link." };
  const raw = String(form.get("url") ?? "").trim().slice(0, 1000);
  if (raw && !normalizeFeedUrl(raw)) return { error: "That isn't a secure web address. Paste the link that starts with webcal:// or https://." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("pack_settings")
    .upsert({ key: COUNCIL_URL_KEY, value: raw, updated_at: new Date().toISOString() });
  if (error) return { error: "Couldn't save the link." };
  refresh();
  if (!raw) return { ok: true, message: "Link removed. The council calendar won't be checked." };
  const checked = await runCheck();
  return checked.error ? { error: `Link saved, but the check didn't work. ${checked.error}` } : checked;
}

/** Committee: check the council calendar now. */
export async function checkCouncilNow(): Promise<ActionResult> {
  const me = await requireMember();
  if (!isCommittee(me)) return { error: "Only the committee can check the council calendar." };
  return runCheck();
}

interface Staged {
  uid: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  url: string | null;
  description: string | null;
  status: string;
  event_id: string | null;
}

/** Committee: put a council event on the pack calendar. */
export async function addCouncilEvent(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  if (!isCommittee(me)) return { error: "Only the committee can add council events." };
  const uid = String(form.get("uid") ?? "");
  const supabase = await createClient();
  const { data } = await supabase
    .from("council_events")
    .select("uid, title, starts_at, ends_at, all_day, location, url, description, status, event_id")
    .eq("uid", uid)
    .maybeSingle();
  const c = data as Staged | null;
  if (!c) return { error: "That council event is gone. Reload the page." };
  if (c.status === "added") return { error: "It's already on our calendar." };

  const title = String(form.get("title") ?? "").trim().slice(0, 200);
  if (!title) return { error: "Give the event a name." };
  const category = String(form.get("category") ?? "").trim().slice(0, 40) || "Council";
  const denId = String(form.get("den_id") ?? "");
  const ranks = form.getAll("ranks").map(String).filter((r) => RANKS.includes(r));
  const note = String(form.get("note") ?? "").trim().slice(0, 1500);
  const link = c.url && /^https?:\/\//i.test(c.url) ? c.url.slice(0, 500) : null;

  const row = {
    title,
    category,
    starts_at: c.starts_at,
    ends_at: c.ends_at,
    all_day: c.all_day,
    location_name: c.location?.slice(0, 200) ?? null,
    details: [note, c.description].filter(Boolean).join("\n\n").slice(0, 5000) || null,
    signup_url: link,
    den_id: UUID.test(denId) ? denId : null,
    ranks: !UUID.test(denId) && ranks.length ? ranks : null,
    leaders_only: form.get("leaders_only") === "on",
    source: "council",
  };

  // Added before and then taken off: put that same event back instead of making a copy.
  let eventId: string | null = null;
  if (c.event_id) {
    const { data: updated } = await supabase
      .from("events")
      .update({ ...row, archived_at: null, archived_reason: null })
      .eq("id", c.event_id)
      .select("id")
      .maybeSingle();
    eventId = (updated?.id as string | undefined) ?? null;
  }
  if (!eventId) {
    const { data: inserted, error } = await supabase
      .from("events")
      .insert({ ...row, created_by: me.id })
      .select("id")
      .single();
    if (error || !inserted) return { error: "Couldn't add the event." };
    eventId = inserted.id as string;
  }
  const { error } = await supabase.from("council_events").update({ status: "added", event_id: eventId }).eq("uid", uid);
  if (error) return { error: "The event is on our calendar, but the list didn't update. Reload the page." };
  refresh();
  return { ok: true, message: "Added to our calendar." };
}

/** Committee: skip a council event, or undo a skip. */
export async function setCouncilSkipped(form: FormData) {
  const me = await requireMember();
  if (!isCommittee(me)) return;
  const uid = String(form.get("uid") ?? "");
  const skip = form.get("skip") === "1";
  const supabase = await createClient();
  await supabase
    .from("council_events")
    .update({ status: skip ? "skipped" : "new" })
    .eq("uid", uid)
    .eq("status", skip ? "new" : "skipped");
  refresh();
}

/**
 * Committee: undo an add. With "also take it off our calendar" the pack event moves to the
 * archive (the same as a leader's "Take off the calendar"); adding it again brings it back.
 * Without, the pack event stays and is no longer linked to the council event.
 */
export async function undoCouncilAdd(form: FormData) {
  const me = await requireMember();
  if (!isCommittee(me)) return;
  const uid = String(form.get("uid") ?? "");
  const takeOff = form.get("take_off") === "on";
  const supabase = await createClient();
  const { data } = await supabase.from("council_events").select("status, event_id").eq("uid", uid).maybeSingle();
  if (!data || data.status !== "added") return;
  const eventId = data.event_id as string | null;
  if (eventId && takeOff) {
    await supabase
      .from("events")
      .update({ archived_at: new Date().toISOString(), archived_reason: "hidden" })
      .eq("id", eventId)
      .is("archived_at", null);
  }
  await supabase
    .from("council_events")
    .update({ status: "new", event_id: takeOff ? eventId : null })
    .eq("uid", uid);
  refresh();
}
