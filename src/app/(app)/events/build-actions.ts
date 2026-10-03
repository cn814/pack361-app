"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isLeader, requireMember } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { easternToIso } from "@/lib/calendar";
import { addDays, easternDate } from "@/lib/tz";
import { linesToItems, moveInList, packingGroups } from "@/lib/event-builder";
import type { ActionResult } from "@/components/ActionForm";
import type { EventLink, EventSection } from "@/lib/types";

// Leaders build an event's schedule, packing list, info sections and links here, instead of
// in SQL. Packing items keep their ids when edited: families' ticks are stored by item id.

const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const CHANGED = "Someone else changed this list. Reload the page and try again.";

type Db = Awaited<ReturnType<typeof createClient>>;

/** Signed-in leader and the event id from the form, or the error to show. */
async function leaderFor(form: FormData): Promise<{ eventId: string; supabase: Db } | { error: string }> {
  const me = await requireMember();
  if (!isLeader(me)) return { error: "Only leaders can build events." };
  const eventId = String(form.get("event_id") ?? "");
  if (!UUID.test(eventId)) return { error: "Event not found." };
  return { eventId, supabase: await createClient() };
}

function refresh(eventId: string) {
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/campouts/${eventId}`);
  revalidatePath(`/events/${eventId}/build`);
}

const text = (form: FormData, k: string, max: number) =>
  String(form.get(k) ?? "")
    .trim()
    .slice(0, max) || null;

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

/** Add a schedule item, or change one (with `id`). */
export async function saveScheduleItem(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await leaderFor(form);
  if ("error" in ctx) return ctx;
  const { eventId, supabase } = ctx;
  const id = String(form.get("id") ?? "");
  const date = String(form.get("date") ?? "");
  const time = String(form.get("time") ?? "");
  const title = text(form, "title", 200);
  if (!title) return { error: "Say what's happening, like “Campfire”." };
  if (!DATE.test(date)) return { error: "Pick the day." };
  if (!TIME.test(time)) return { error: "Pick the time." };
  const { data: ev } = await supabase.from("events").select("starts_at, ends_at").eq("id", eventId).maybeSingle();
  if (!ev) return { error: "Event not found." };
  // A typo in the year is easy on a phone: keep items within a month of the event.
  const first = addDays(easternDate(ev.starts_at), -31);
  const last = addDays(easternDate(ev.ends_at ?? ev.starts_at), 31);
  if (date < first || date > last) return { error: "That day is far from the event's dates. Check the date." };
  const row = {
    starts_at: easternToIso(date, time),
    title,
    location: text(form, "location", 200),
    notes: text(form, "notes", 1000),
  };
  if (id) {
    if (!UUID.test(id)) return { error: CHANGED };
    const { data, error } = await supabase.from("itinerary_items").update(row).eq("id", id).eq("event_id", eventId).select("id");
    if (error) return { error: "Couldn't save that. Try again." };
    if (!data?.length) return { error: CHANGED };
  } else {
    const { error } = await supabase.from("itinerary_items").insert({ ...row, event_id: eventId });
    if (error) return { error: "Couldn't add that. Try again." };
  }
  refresh(eventId);
  return { ok: true, message: id ? "Saved." : "Added to the schedule." };
}

export async function deleteScheduleItem(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await leaderFor(form);
  if ("error" in ctx) return ctx;
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return { error: CHANGED };
  const { error } = await ctx.supabase.from("itinerary_items").delete().eq("id", id).eq("event_id", ctx.eventId);
  if (error) return { error: "Couldn't delete that. Try again." };
  refresh(ctx.eventId);
  return { ok: true, message: "Deleted." };
}

// ---------------------------------------------------------------------------
// Packing list
// ---------------------------------------------------------------------------

/** Add a packing item, or change one (with `id`, which stays the same). */
export async function savePackingItem(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await leaderFor(form);
  if ("error" in ctx) return ctx;
  const { eventId, supabase } = ctx;
  const id = String(form.get("id") ?? "");
  const category = text(form, "category", 60);
  const label = text(form, "label", 200);
  if (!category) return { error: "Pick a group for it, like “Sleeping” or “Clothes”." };
  if (!label) return { error: "Name the item." };
  const row = { category, label, detail: text(form, "detail", 300) };
  if (id) {
    if (!UUID.test(id)) return { error: CHANGED };
    const { data, error } = await supabase.from("packing_items").update(row).eq("id", id).eq("event_id", eventId).select("id");
    if (error) return { error: "Couldn't save that. Try again." };
    if (!data?.length) return { error: CHANGED };
  } else {
    // New items go at the end of their group (or the end of the list, for a new group).
    const { data: items } = await supabase.from("packing_items").select("id, category, sort_order").eq("event_id", eventId);
    const list = items ?? [];
    if (list.length >= 200) return { error: "That's a long list! The most is 200 items." };
    const { error } = await supabase
      .from("packing_items")
      .insert({ ...row, event_id: eventId, required: false, sort_order: list.reduce((n, i) => Math.max(n, i.sort_order), 0) + 1 });
    if (error) return { error: "Couldn't add that. Try again." };
  }
  refresh(eventId);
  return { ok: true, message: id ? "Saved." : "Added to the packing list." };
}

export async function deletePackingItem(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await leaderFor(form);
  if ("error" in ctx) return ctx;
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return { error: CHANGED };
  const { error } = await ctx.supabase.from("packing_items").delete().eq("id", id).eq("event_id", ctx.eventId);
  if (error) return { error: "Couldn't delete that. Try again." };
  refresh(ctx.eventId);
  return { ok: true, message: "Deleted." };
}

/** Move an item up or down within its group, or a whole group up or down (with `category`). */
export async function movePacking(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await leaderFor(form);
  if ("error" in ctx) return ctx;
  const { eventId, supabase } = ctx;
  const dir = form.get("dir") === "up" ? -1 : 1;
  const id = String(form.get("id") ?? "");
  const category = String(form.get("category") ?? "");
  const { data } = await supabase.from("packing_items").select("id, category, sort_order").eq("event_id", eventId).order("id");
  let groups = packingGroups(data ?? []);
  if (id) {
    const g = groups.findIndex(([, items]) => items.some((i) => i.id === id));
    if (g < 0) return { error: CHANGED };
    const items = groups[g][1];
    groups = groups.map((x, k) =>
      k === g
        ? [
            x[0],
            moveInList(
              items,
              items.findIndex((i) => i.id === id),
              dir,
            ),
          ]
        : x,
    );
  } else {
    const g = groups.findIndex(([c]) => c === category);
    if (g < 0) return { error: CHANGED };
    groups = moveInList(groups, g, dir);
  }
  const ids = groups.flatMap(([, items]) => items.map((i) => i.id));
  const { error } = await supabase.rpc("set_packing_order", { p_event_id: eventId, p_ids: ids });
  if (error) return { error: "Couldn't move that. Try again." };
  refresh(eventId);
  return { ok: true };
}

/** Give the event its own packing list, starting from the pack's standard campout list. */
export async function startPackingFromStandard(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await leaderFor(form);
  if ("error" in ctx) return ctx;
  const { eventId, supabase } = ctx;
  const { count } = await supabase.from("packing_items").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  if (count) return { error: "This event already has its own list." };
  const { data: std } = await supabase
    .from("packing_items")
    .select("category, label, detail, required, sort_order")
    .is("event_id", null)
    .order("sort_order");
  if (!std?.length) return { error: "The pack has no standard list to start from. Add items below." };
  const { error } = await supabase.from("packing_items").insert(std.map((i, n) => ({ ...i, event_id: eventId, sort_order: n + 1 })));
  if (error) return { error: "Couldn't copy the standard list. Try again." };
  refresh(eventId);
  return { ok: true, message: "This event now has its own list. Change it below." };
}

// ---------------------------------------------------------------------------
// Info sections and links (kept on the event as lists)
// ---------------------------------------------------------------------------

async function readLists(supabase: Db, eventId: string) {
  const { data } = await supabase.from("events").select("sections, links").eq("id", eventId).maybeSingle();
  if (!data) return null;
  return {
    sections: (Array.isArray(data.sections) ? data.sections : []) as EventSection[],
    links: (Array.isArray(data.links) ? data.links : []) as EventLink[],
  };
}

/** The list entry the form was showing, checked so a stale page can't change the wrong one. */
function pick<T>(list: T[], form: FormData, key: (x: T) => string): number | null {
  const index = Number(form.get("index"));
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return null;
  return key(list[index]) === String(form.get("match") ?? "") ? index : null;
}

const sectionKey = (s: EventSection) => s.title;
const linkKey = (l: EventLink) => l.url;

/** Add an info section, or change one (with `index` and `match`, its current title). */
export async function saveSection(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await leaderFor(form);
  if ("error" in ctx) return ctx;
  const { eventId, supabase } = ctx;
  const lists = await readLists(supabase, eventId);
  if (!lists) return { error: "Event not found." };
  const editing = form.has("index");
  const at = editing ? pick(lists.sections, form, sectionKey) : null;
  if (editing && at === null) return { error: CHANGED };

  const title = text(form, "title", 120);
  const toneRaw = String(form.get("tone") ?? "");
  const tone = toneRaw === "info" || toneRaw === "warn" ? toneRaw : null;
  const body = text(form, "body", 3000);
  const items = linesToItems(String(form.get("items") ?? ""));
  const check = form.get("check") === "on";
  if (!title) return { error: "Give the section a title." };
  if (lists.sections.some((s, i) => i !== at && s.title.trim().toLowerCase() === title.toLowerCase())) {
    return { error: "Another section already has that title. Pick a different one." };
  }
  if (!body && !items.length) return { error: "Add some text or a few bullet items." };
  if (items.length > 60) return { error: "That's a lot of bullet items. The most is 60." };
  if (check && !items.length) return { error: "A tap-to-check list needs items to check off, one per line." };
  if (!editing && lists.sections.length >= 30) return { error: "This event has 30 sections, the most it can have." };

  const section: EventSection = {
    title,
    tone,
    ...(body ? { body } : {}),
    ...(items.length ? { items } : {}),
    ...(check ? { check: true } : {}),
  };
  const sections = at === null ? [...lists.sections, section] : lists.sections.map((s, i) => (i === at ? section : s));
  const { error } = await supabase.from("events").update({ sections }).eq("id", eventId);
  if (error) return { error: "Couldn't save the section. Try again." };
  refresh(eventId);
  return { ok: true, message: editing ? "Saved." : "Section added." };
}

/** Delete or move (dir up/down) an info section. */
export async function changeSection(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await leaderFor(form);
  if ("error" in ctx) return ctx;
  const { eventId, supabase } = ctx;
  const lists = await readLists(supabase, eventId);
  if (!lists) return { error: "Event not found." };
  const at = pick(lists.sections, form, sectionKey);
  if (at === null) return { error: CHANGED };
  const op = String(form.get("op") ?? "");
  const sections = op === "delete" ? lists.sections.filter((_, i) => i !== at) : moveInList(lists.sections, at, op === "up" ? -1 : 1);
  const { error } = await supabase.from("events").update({ sections }).eq("id", eventId);
  if (error) return { error: "Couldn't change that. Try again." };
  refresh(eventId);
  return { ok: true, message: op === "delete" ? "Deleted." : undefined };
}

/** A web address families can open: https only, written out in full. */
function cleanUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`; // "givebutter.com/x" means https
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || !u.hostname.includes(".")) return null;
    return u.toString().slice(0, 500);
  } catch {
    return null;
  }
}

/** Add a link, or change one (with `index` and `match`, its current address). */
export async function saveLink(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await leaderFor(form);
  if ("error" in ctx) return ctx;
  const { eventId, supabase } = ctx;
  const lists = await readLists(supabase, eventId);
  if (!lists) return { error: "Event not found." };
  const editing = form.has("index");
  const at = editing ? pick(lists.links, form, linkKey) : null;
  if (editing && at === null) return { error: CHANGED };

  const label = text(form, "label", 120);
  const raw = String(form.get("url") ?? "");
  const url = cleanUrl(raw);
  const note = text(form, "note", 300);
  if (!label) return { error: "Give the link a name families will recognize." };
  if (!raw.trim()) return { error: "Paste the web address." };
  if (!url) return { error: "That web address doesn't look right. It should start with https://" };
  if (lists.links.some((l, i) => i !== at && l.url === url)) return { error: "That link is already on the list." };
  if (!editing && lists.links.length >= 30) return { error: "This event has 30 links, the most it can have." };

  const link: EventLink = { label, url, ...(note ? { note } : {}) };
  const links = at === null ? [...lists.links, link] : lists.links.map((l, i) => (i === at ? link : l));
  const { error } = await supabase.from("events").update({ links }).eq("id", eventId);
  if (error) return { error: "Couldn't save the link. Try again." };
  refresh(eventId);
  return { ok: true, message: editing ? "Saved." : "Link added." };
}

/** Delete or move (dir up/down) a link. */
export async function changeLink(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await leaderFor(form);
  if ("error" in ctx) return ctx;
  const { eventId, supabase } = ctx;
  const lists = await readLists(supabase, eventId);
  if (!lists) return { error: "Event not found." };
  const at = pick(lists.links, form, linkKey);
  if (at === null) return { error: CHANGED };
  const op = String(form.get("op") ?? "");
  const links = op === "delete" ? lists.links.filter((_, i) => i !== at) : moveInList(lists.links, at, op === "up" ? -1 : 1);
  const { error } = await supabase.from("events").update({ links }).eq("id", eventId);
  if (error) return { error: "Couldn't change that. Try again." };
  refresh(eventId);
  return { ok: true, message: op === "delete" ? "Deleted." : undefined };
}

// ---------------------------------------------------------------------------
// Start from a past event, and copy an event
// ---------------------------------------------------------------------------

const PARTS = ["schedule", "packing", "sections", "links"] as const;

/** Copy the ticked parts (schedule moved to this event's dates) from another event. */
export async function copyPlanFrom(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await leaderFor(form);
  if ("error" in ctx) return ctx;
  const { eventId, supabase } = ctx;
  const from = String(form.get("from_id") ?? "");
  const parts = form
    .getAll("parts")
    .map(String)
    .filter((p): p is (typeof PARTS)[number] => (PARTS as readonly string[]).includes(p));
  if (!UUID.test(from)) return { error: "Pick the event to start from." };
  if (from === eventId) return { error: "Pick a different event." };
  if (!parts.length) return { error: "Tick at least one thing to copy." };
  const { error } = await supabase.rpc("copy_event_plan", { p_from: from, p_to: eventId, p_parts: parts });
  if (error) return { error: error.code === "P0002" ? "That event is gone. Reload the page." : "Couldn't copy. Try again." };
  refresh(eventId);
  return { ok: true, message: "Copied. Look it over below and change what's different this time." };
}

/** Copy the whole event to a new date, then open the copy's edit page. */
export async function copyEvent(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await leaderFor(form);
  if ("error" in ctx) return ctx;
  const { eventId, supabase } = ctx;
  const date = String(form.get("date") ?? "");
  if (!DATE.test(date)) return { error: "Pick the date for the copy." };
  const { data, error } = await supabase.rpc("copy_event", { p_from: eventId, p_start: date });
  if (error || typeof data !== "string") {
    return { error: error?.code === "P0002" ? "Event not found." : "Couldn't copy the event. Try again." };
  }
  revalidatePath("/", "layout");
  redirect(`/events/${data}/edit?copied=1`);
}
