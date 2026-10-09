"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/ActionForm";
import { isLeader, requireMember } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { addDays, easternDate } from "@/lib/tz";
import { notifyFormTurnedIn } from "@/lib/notify";

const UUID = /^[0-9a-f-]{36}$/i;
/** Same window as formState() in src/lib/paperwork.ts: "expiring" within this many days. */
const RENEW_DAYS = 45;
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
  const me = await requireMember();
  const who = person(String(form.get("who") ?? ""));
  const date = String(form.get("form_date") ?? "").trim();
  if (!who) return { error: "Pick who the form is for." };
  if (date && (!DATE.test(date) || date > easternDate(Date.now()))) return { error: "Use the date written on the form (not in the future)." };
  const supabase = await createClient();
  const row = { status: "submitted", form_date: date || null, expires_on: null };
  const onFile = { ok: true, message: "A leader already has this form on file. Nothing more to do." };
  // An on-file form can be replaced only once it's expired or expiring (when the card offers
  // "I turned it in" again), so a leader's "received" mark is never undone by a family.
  const renewFrom = addDays(easternDate(Date.now()), RENEW_DAYS);
  const { data: existing } = await supabase
    .from("health_forms")
    .select("id, status, expires_on")
    .eq(who.col, who.id)
    .maybeSingle();
  if (existing?.status === "on_file" && !(existing.expires_on && existing.expires_on <= renewFrom)) return onFile;
  if (existing) {
    const { data: updated, error } = await supabase
      .from("health_forms")
      .update(row)
      .eq("id", existing.id)
      .or(`status.neq.on_file,expires_on.lte.${renewFrom}`)
      .select("id");
    if (error) return { error: "Couldn't save that. Try again." };
    if (!updated?.length) {
      refresh();
      return onFile;
    }
  } else {
    const { error } = await supabase.from("health_forms").insert({ [who.col]: who.id, ...row });
    if (error) return { error: "Couldn't save that. Try again." };
  }
  refresh();
  const { data: fam } = me.family_id ? await supabase.from("families").select("family_name").eq("id", me.family_id).maybeSingle() : { data: null };
  const familyName = (fam?.family_name as string | undefined) ?? null;
  after(() => notifyFormTurnedIn(familyName, me.id));
  return { ok: true, message: "Thanks! A leader will confirm it when they get the form." };
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
