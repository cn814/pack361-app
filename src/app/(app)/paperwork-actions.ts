"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/ActionForm";
import { isLeader, requireMember } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { easternDate } from "@/lib/tz";

const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "s:<scout id>" or "a:<adult id>" -> the matching column. */
function person(v: string): { col: "scout_id" | "adult_id"; id: string } | null {
  const [k, id] = v.split(":");
  if (!UUID.test(id ?? "")) return null;
  if (k === "s") return { col: "scout_id", id };
  if (k === "a") return { col: "adult_id", id };
  return null;
}

function refresh() {
  revalidatePath("/family");
  revalidatePath("/leaders/paperwork");
  revalidatePath("/");
}

/** A family says they turned in a medical form (RLS: only their own people, only "submitted"). */
export async function reportHealthForm(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireMember();
  const who = person(String(form.get("who") ?? ""));
  const date = String(form.get("form_date") ?? "").trim();
  if (!who) return { error: "Pick who the form is for." };
  if (date && (!DATE.test(date) || date > easternDate(Date.now()))) return { error: "Use the date written on the form (not in the future)." };
  const supabase = await createClient();
  const row = { status: "submitted", form_date: date || null, expires_on: null };
  const { data: existing } = await supabase.from("health_forms").select("id").eq(who.col, who.id).maybeSingle();
  const { error } = existing
    ? await supabase.from("health_forms").update(row).eq("id", existing.id)
    : await supabase.from("health_forms").insert({ [who.col]: who.id, ...row });
  if (error) return { error: "Couldn't save that. Try again." };
  refresh();
  return { ok: true, message: "Thanks! A leader will confirm it when they get the form." };
}

/** A family says they paid this season's dues. */
export async function reportDuesPaid(): Promise<ActionResult> {
  const me = await requireMember();
  if (!me.family_id) return { error: "Your account isn't linked to a family." };
  const settings = await getSettings();
  const supabase = await createClient();
  const { error } = await supabase
    .from("dues_payments")
    .upsert({ family_id: me.family_id, season: settings.dues_season, status: "submitted", paid_on: easternDate(Date.now()) });
  if (error) return { error: "Couldn't save that. Try again." };
  refresh();
  return { ok: true, message: "Thanks! A leader will confirm it." };
}

/** Leaders: mark forms received. Keeps the date the family gave unless a date is entered. */
export async function markFormsOnFile(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  if (!isLeader(me)) return { error: "Leaders only." };
  const people = form.getAll("who").map((v) => person(String(v))).filter(Boolean) as { col: "scout_id" | "adult_id"; id: string }[];
  const date = String(form.get("form_date") ?? "").trim();
  const clear = form.get("intent") === "clear";
  if (!people.length) return { error: "Check the people whose forms you have." };
  if (date && !DATE.test(date)) return { error: "Pick the date on the form." };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("health_forms").select("id, scout_id, adult_id, form_date");
  const today = easternDate(Date.now());
  let saved = 0;
  for (const p of people) {
    const row = (existing ?? []).find((f) => f[p.col] === p.id);
    if (clear) {
      if (row) await supabase.from("health_forms").delete().eq("id", row.id);
      saved++;
      continue;
    }
    const patch = { status: "on_file", form_date: date || row?.form_date || today, expires_on: null };
    const { error } = row
      ? await supabase.from("health_forms").update(patch).eq("id", row.id)
      : await supabase.from("health_forms").insert({ [p.col]: p.id, ...patch });
    if (!error) saved++;
  }
  refresh();
  return { ok: true, message: clear ? `Cleared ${saved}.` : `Marked ${saved} form${saved === 1 ? "" : "s"} received.` };
}

/** Leaders: mark families' dues paid (or clear). */
export async function markDues(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireMember();
  if (!isLeader(me)) return { error: "Leaders only." };
  const ids = form.getAll("family").map(String).filter((s) => UUID.test(s));
  const clear = form.get("intent") === "clear";
  if (!ids.length) return { error: "Check the families who paid." };
  const settings = await getSettings();
  const supabase = await createClient();
  const { error } = clear
    ? await supabase.from("dues_payments").delete().eq("season", settings.dues_season).in("family_id", ids)
    : await supabase
        .from("dues_payments")
        .upsert(ids.map((family_id) => ({ family_id, season: settings.dues_season, status: "paid", paid_on: easternDate(Date.now()) })));
  if (error) return { error: "Couldn't save that." };
  refresh();
  return { ok: true, message: clear ? `Cleared ${ids.length}.` : `Marked ${ids.length} famil${ids.length === 1 ? "y" : "ies"} paid.` };
}
