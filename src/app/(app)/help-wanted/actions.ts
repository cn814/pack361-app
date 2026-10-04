"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { ActionResult } from "@/components/ActionForm";
import { displayName, isCommittee, requireMember } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { notifyRoleInterest } from "@/lib/help-wanted";

const UUID = /^[0-9a-f-]{36}$/i;

const text = (form: FormData, key: string, max: number) =>
  String(form.get(key) ?? "").replace(/\r/g, "").trim().slice(0, max) || null;

function refresh() {
  revalidatePath("/help-wanted");
  revalidatePath("/");
}

/** "I can help": records the offer and lets key leaders know. */
export async function offerHelp(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const roleId = String(form.get("role_id") ?? "");
  if (!UUID.test(roleId)) return { error: "That job wasn't found." };
  const supabase = await createClient();
  const { error } = await supabase.from("role_interest").insert({ role_id: roleId, adult_id: me.id, note: text(form, "note", 500) });
  if (error) {
    if (error.code === "23505") return { ok: true, message: "You already offered. Thank you!" };
    return { error: error.code === "42501" ? "This job was just filled or closed." : "Couldn't send that. Try again." };
  }
  // At most one alert a day per person per role (offer, withdraw, offer again doesn't re-alert).
  // Before that database function exists, alert as before.
  const { data: claimed, error: claimErr } = await supabase.rpc("claim_role_interest_alert", { p_role_id: roleId });
  const missing = claimErr && (claimErr.code === "PGRST202" || claimErr.code === "42883");
  if (claimed === true || missing) {
    const who = `${displayName(me)} ${me.last_name}`;
    after(() => notifyRoleInterest({ roleId, who, adultId: me.id }));
  }
  refresh();
  return { ok: true, message: "Thank you! A key leader will reach out." };
}

/** Take back your own offer. */
export async function withdrawOffer(form: FormData) {
  const me = await requireMember();
  const roleId = String(form.get("role_id") ?? "");
  if (!UUID.test(roleId)) return;
  const supabase = await createClient();
  await supabase.from("role_interest").delete().eq("role_id", roleId).eq("adult_id", me.id);
  refresh();
}

/** Key leaders: add or change a role. */
export async function saveRole(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  if (!isCommittee(me)) return { error: "Only key leaders can change these jobs." };
  const id = String(form.get("id") ?? "");
  if (id && !UUID.test(id)) return { error: "That job wasn't found." };
  const title = text(form, "title", 100);
  if (!title) return { error: "Name the job, e.g. “Popcorn kernel”." };
  const contact = String(form.get("contact_adult_id") ?? "");
  const order = Number(form.get("sort_order") ?? 0);
  const row = {
    title,
    description: text(form, "description", 1000),
    contact_adult_id: UUID.test(contact) ? contact : null,
    sort_order: Number.isInteger(order) ? Math.max(-999, Math.min(999, order)) : 0,
  };
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("pack_roles").update(row).eq("id", id).select("id").maybeSingle()
    : await supabase.from("pack_roles").insert(row).select("id").maybeSingle();
  if (error || !data) return { error: "Couldn't save that. Try again." };
  refresh();
  return { ok: true, message: id ? "Saved" : "Added. Families can see it now." };
}

/** Key leaders: close a role (optionally saying who's doing it) or open it again. */
export async function setRoleOpen(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  if (!isCommittee(me)) return { error: "Only key leaders can change these jobs." };
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return { error: "That job wasn't found." };
  const open = form.get("open") === "1";
  const filled = String(form.get("filled_by") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pack_roles")
    .update({ open, filled_by: open ? null : UUID.test(filled) ? filled : null })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "Couldn't save that. Try again." };
  refresh();
  return { ok: true, message: open ? "Open again" : "Closed" };
}

/** Key leaders: delete a role and its offers for good. */
export async function deleteRole(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  if (!isCommittee(me)) return { error: "Only key leaders can change these jobs." };
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return { error: "That job wasn't found." };
  const supabase = await createClient();
  const { error } = await supabase.from("pack_roles").delete().eq("id", id);
  if (error) return { error: "Couldn't delete that. Try again." };
  refresh();
  return { ok: true, message: "Deleted" };
}
