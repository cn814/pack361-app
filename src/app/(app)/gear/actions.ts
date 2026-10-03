"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import type { ActionResult } from "@/components/ActionForm";
import { isLeader, requireMember } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { GEAR_CATEGORIES, gearToday, notifyGearDecision, notifyGearRequest, type GearCategory } from "@/lib/gear";

const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const text = (form: FormData, key: string, max: number) =>
  String(form.get(key) ?? "").replace(/\r/g, "").trim().slice(0, max) || null;

function refresh() {
  revalidatePath("/gear");
  revalidatePath("/gear/manage");
}

/** A family asks to borrow an item. */
export async function requestGear(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  if (!me.family_id) return { error: "Gear is lent to families, and your login isn't linked to one. Ask a leader for help." };
  const itemId = String(form.get("item_id") ?? "");
  if (!UUID.test(itemId)) return { error: "That item wasn't found." };
  const quantity = Number(form.get("quantity") ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return { error: "Choose how many you need." };
  const eventId = String(form.get("event_id") ?? "");
  const neededOn = String(form.get("needed_on") ?? "");
  const dueOn = String(form.get("due_on") ?? "");
  const today = gearToday();
  if (neededOn && (!DATE.test(neededOn) || neededOn < today)) return { error: "Pick a pick-up day from today on." };
  if (!DATE.test(dueOn)) return { error: "Pick the day you'll bring it back." };
  if (dueOn < (neededOn || today)) return { error: "The bring-back day should be after the pick-up day." };

  const supabase = await createClient();
  const { data: item } = await supabase.from("gear_items").select("name, quantity, active").eq("id", itemId).maybeSingle();
  if (!item || !item.active) return { error: "That item isn't available to borrow." };
  if (quantity > item.quantity) return { error: `The pack has only ${item.quantity} of these.` };

  const { error } = await supabase.from("gear_loans").insert({
    item_id: itemId,
    family_id: me.family_id,
    adult_id: me.id,
    quantity,
    event_id: UUID.test(eventId) ? eventId : null,
    needed_on: neededOn || null,
    due_on: dueOn,
    note: text(form, "note", 500),
  });
  if (error) return { error: error.code === "22023" ? error.message : "Couldn't send your request. Try again." };

  const { data: fam } = await supabase.from("families").select("family_name").eq("id", me.family_id).maybeSingle();
  const family = (fam?.family_name as string | undefined) ?? me.last_name;
  after(() => notifyGearRequest({ family, item: item.name as string, quantity, requesterId: me.id }));
  refresh();
  redirect("/gear?done=sent");
}

/** A family cancels a request before the gear is picked up. */
export async function cancelGearRequest(form: FormData) {
  const me = await requireMember();
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id) || !me.family_id) redirect("/gear");
  const supabase = await createClient();
  const { data } = await supabase
    .from("gear_loans")
    .delete()
    .eq("id", id)
    .eq("family_id", me.family_id)
    .in("status", ["requested", "approved"])
    .select("id");
  refresh();
  redirect(data?.length ? "/gear?done=cancelled" : "/gear");
}

/** Leaders: add or change an item in the closet. */
export async function saveGearItem(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  if (!isLeader(me)) return { error: "Only leaders can change the gear closet." };
  const id = String(form.get("id") ?? "");
  if (id && !UUID.test(id)) return { error: "That item wasn't found." };
  const name = text(form, "name", 80);
  if (!name) return { error: "Name the item, e.g. “Six-person tent”." };
  const category = String(form.get("category") ?? "Other") as GearCategory;
  if (!GEAR_CATEGORIES.includes(category)) return { error: "Choose a kind of gear." };
  const quantity = Number(form.get("quantity") ?? 1);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999) return { error: "How many should be 0 to 999." };
  const row = {
    name,
    category,
    quantity,
    description: text(form, "description", 500),
    condition_note: text(form, "condition_note", 200),
    active: id ? form.get("active") === "on" : true,
  };
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("gear_items").update(row).eq("id", id).select("id").maybeSingle()
    : await supabase.from("gear_items").insert(row).select("id").maybeSingle();
  if (error || !data) return { error: "Couldn't save that. Try again." };
  refresh();
  redirect(`/gear/manage?done=${id ? "saved" : "added"}`);
}

const NEXT_STATUS: Record<string, { status: string; from: string[]; message: string }> = {
  approve: { status: "approved", from: ["requested"], message: "Approved. The family will get a phone alert." },
  decline: { status: "declined", from: ["requested", "approved"], message: "Declined. The family will get a phone alert." },
  out: { status: "out", from: ["requested", "approved"], message: "Marked as picked up." },
  returned: { status: "returned", from: ["out"], message: "Checked back in. Thanks!" },
};

/** Leaders: approve, decline, hand out, check back in, or change the bring-back day. */
export async function updateGearLoan(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  if (!isLeader(me)) return { error: "Only leaders can manage gear." };
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return { error: "That request wasn't found." };
  const what = String(form.get("do") ?? "");
  const supabase = await createClient();

  if (what === "due") {
    const dueOn = String(form.get("due_on") ?? "");
    if (!DATE.test(dueOn)) return { error: "Pick the new bring-back day." };
    const { data, error } = await supabase.from("gear_loans").update({ due_on: dueOn }).eq("id", id).select("id").maybeSingle();
    if (error || !data) return { error: error?.code === "23514" ? "The bring-back day should be after the pick-up day." : "Couldn't save that. Try again." };
    refresh();
    return { ok: true, message: "New bring-back day saved." };
  }

  const step = NEXT_STATUS[what];
  if (!step) return { error: "Choose what to do." };
  const row: Record<string, unknown> = { status: step.status };
  if (what === "decline") row.leader_note = text(form, "leader_note", 300);
  const { data, error } = await supabase
    .from("gear_loans")
    .update(row)
    .eq("id", id)
    .in("status", step.from)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.code === "22023" ? `${error.message}.` : "Couldn't save that. Try again." };
  if (!data) return { error: "Someone else already handled this one. Pull down to refresh." };
  if (what === "approve" || what === "decline") after(() => notifyGearDecision(id));
  refresh();
  return { ok: true, message: step.message };
}
