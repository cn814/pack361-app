"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/ActionForm";
import { isCommittee, requireMember } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { getSettings, settingCents } from "@/lib/settings";
import { CHARGE_KINDS, parseDollars, type ChargeKind } from "@/lib/money";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WHO = ["families", "scouts", "leaders", "den_families", "den_scouts", "family", "person"] as const;

async function requireCommittee() {
  const me = await requireMember();
  if (!isCommittee(me)) redirect("/leaders");
  return me;
}

function refresh() {
  revalidatePath("/leaders/money");
  revalidatePath("/pay");
  revalidatePath("/family");
  revalidatePath("/inbox");
  revalidatePath("/");
}

/** Back to the same filtered list, with a short note on top. */
function back(form: FormData, note: string): never {
  const raw = String(form.get("back") ?? "");
  const base = /^\/leaders\/money(\?[^\\]*)?$/.test(raw) ? raw : "/leaders/money";
  const url = new URL(base, "http://x");
  url.searchParams.set("note", note);
  redirect(`${url.pathname}${url.search}`);
}

const ids = (form: FormData) =>
  form
    .getAll("id")
    .flatMap((v) => String(v).split(","))
    .filter((v) => UUID.test(v));

/** One charge's buttons: set the amount, mark paid (cash/check/other), confirm, waive, cancel, reopen. */
export async function chargeAction(form: FormData) {
  await requireCommittee();
  const list = ids(form);
  const act = String(form.get("do") ?? "");
  const how = String(form.get("how") ?? "");
  if (!list.length) back(form, "Nothing picked.");
  const supabase = await createClient();
  if (act === "amount") {
    const cents = parseDollars(String(form.get("amount") ?? ""));
    if (cents === null) back(form, "Write the amount in dollars, like 60 or 12.50 (up to $1,000).");
    const { data, error } = await supabase
      .from("charges")
      .update({ amount_cents: cents })
      .in("id", list)
      .in("status", ["open", "reported"])
      .select("id");
    if (error) back(form, "Couldn't save that. Try again.");
    refresh();
    back(form, data?.length ? "Amount saved." : "Nothing changed (only unpaid items can change).");
  }
  if (act === "paid" || act === "confirm") {
    // A $0 charge (like dues moved from the old list) needs its amount first: don't record $0.
    const { data: zero } = await supabase.from("charges").select("id").in("id", list).eq("amount_cents", 0).limit(1);
    if (zero?.length) back(form, "Set the amount first (or waive it if there's nothing to pay).");
  }
  let action: string;
  let p_how: string | null = null;
  let done: string;
  switch (act) {
    case "paid":
      action = "paid";
      p_how = ["cash", "check", "other"].includes(how) ? how : "other";
      done = "Marked paid.";
      break;
    case "confirm":
      action = "paid";
      done = list.length === 1 ? "Confirmed." : `Confirmed ${list.length}.`;
      break;
    case "waive":
      action = "waive";
      done = "Waived.";
      break;
    case "cancel":
      action = "cancel";
      done = "Canceled.";
      break;
    case "reopen":
      action = "reopen";
      done = "Reopened: it shows as due again.";
      break;
    default:
      back(form, "Unknown action.");
  }
  const { data, error } = await supabase.rpc("update_charges", { p_ids: list, p_action: action, p_how, p_note: null });
  if (error) {
    back(form, /charges_.*_key|duplicate/i.test(error.message) ? "Can't reopen: there's already another charge like it." : "Couldn't save that. Try again.");
  }
  refresh();
  back(form, data ? done : "Nothing changed (it may have been paid online, or already changed).");
}

/** Add a fee for a group of people (skips anyone who already has it). */
export async function addFee(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireCommittee();
  const kind = String(form.get("kind") ?? "") as ChargeKind;
  const title = String(form.get("title") ?? "").trim().slice(0, 120);
  const season = String(form.get("season") ?? "").trim().slice(0, 20);
  const amount = parseDollars(String(form.get("amount") ?? ""));
  const due = String(form.get("due_on") ?? "").trim();
  const who = String(form.get("who") ?? "") as (typeof WHO)[number];
  const eventId = String(form.get("event_id") ?? "");
  if (!CHARGE_KINDS.includes(kind)) return { error: "Pick what the fee is for." };
  if (!title) return { error: "Give the fee a name families will recognize." };
  if (amount === null) return { error: "Write the amount in dollars, like 60 or 12.50 (up to $1,000)." };
  if (due && !DATE.test(due)) return { error: "Pick the due date." };
  if (!WHO.includes(who)) return { error: "Pick who owes it." };
  if (kind === "event" && !UUID.test(eventId)) return { error: "Pick the event." };

  let p_who: string = who;
  let target: string | null = null;
  if (who === "den_families" || who === "den_scouts") target = String(form.get("den_id") ?? "");
  if (who === "family") target = String(form.get("family_id") ?? "");
  if (who === "person") {
    const [k, id] = String(form.get("person") ?? "").split(":");
    p_who = k === "s" ? "scout" : k === "a" ? "adult" : "";
    target = id ?? "";
  }
  if (target !== null && !UUID.test(target)) return { error: "Pick who it's for." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_fee", {
    p_kind: kind,
    p_title: title,
    p_season: season || null,
    p_event_id: kind === "event" ? eventId : null,
    p_amount_cents: amount,
    p_due_on: due || null,
    p_who,
    p_target: target,
  });
  if (error) return { error: error.code === "22023" ? error.message : "Couldn't add the fee. Try again." };
  const r = ((data ?? []) as { added: number; skipped: number }[])[0] ?? { added: 0, skipped: 0 };
  refresh();
  return { ok: true, message: `Added ${r.added}, skipped ${r.skipped} already there.` };
}

/** Shortcut: national and council fees for every active scout and registered adult leader. */
export async function addRegistrationFees(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireCommittee();
  const s = await getSettings();
  const year = s.registration_year;
  const due = String(form.get("due_on") ?? "").trim();
  if (!/^\d{4}$/.test(year)) return { error: "Set the registration year in Settings first." };
  if (due && !DATE.test(due)) return { error: "Pick the due date." };
  const parts = [
    { kind: "national", title: `Scouting America registration ${year}`, who: "scouts", cents: settingCents(s, "national_youth_cents") },
    { kind: "national", title: `Scouting America registration ${year}`, who: "leaders", cents: settingCents(s, "national_adult_cents") },
    { kind: "council", title: `Council fee ${year}`, who: "scouts", cents: settingCents(s, "council_youth_cents") },
    { kind: "council", title: `Council fee ${year}`, who: "leaders", cents: settingCents(s, "council_adult_cents") },
  ];
  const todo = parts.filter((p) => p.cents > 0);
  if (!todo.length) return { error: "Fill in the registration and council amounts in Settings first." };
  const supabase = await createClient();
  let added = 0;
  let skipped = 0;
  for (const p of todo) {
    const { data, error } = await supabase.rpc("add_fee", {
      p_kind: p.kind,
      p_title: p.title,
      p_season: year,
      p_event_id: null,
      p_amount_cents: p.cents,
      p_due_on: due || null,
      p_who: p.who,
      p_target: null,
    });
    if (error) return { error: `Stopped partway (added ${added} so far). Try again; anything already added is skipped.` };
    const r = ((data ?? []) as { added: number; skipped: number }[])[0];
    added += r?.added ?? 0;
    skipped += r?.skipped ?? 0;
  }
  refresh();
  const left = parts.length - todo.length;
  return {
    ok: true,
    message: `Added ${added}, skipped ${skipped} already there.${left ? ` ${left} of the 4 amounts are $0 in Settings, so those weren't added.` : ""}`,
  };
}

/** Registration money sent on to the council (or clear that). */
export async function setRemitted(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireCommittee();
  const list = ids(form);
  const clear = form.get("intent") === "clear";
  const date = String(form.get("remitted_on") ?? "").trim();
  if (!list.length) return { error: "Tick the people whose fees you sent." };
  if (!clear && !DATE.test(date)) return { error: "Pick the date you sent it." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_remitted", { p_ids: list, p_on: clear ? null : date });
  if (error) return { error: "Couldn't save that. Try again." };
  refresh();
  return { ok: true, message: clear ? `Cleared ${data ?? 0}.` : `Marked ${data ?? 0} fee${data === 1 ? "" : "s"} sent to the council.` };
}

/** Fee amounts and other ways to pay. */
export async function savePaySettings(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireCommittee();
  const values: Record<string, string> = {};
  const season = String(form.get("dues_season") ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(season)) return { error: "Write the dues season like 2026-27." };
  values.dues_season = season;
  const year = String(form.get("registration_year") ?? "").trim();
  if (year && !/^\d{4}$/.test(year)) return { error: "Write the registration year like 2027." };
  values.registration_year = year;
  for (const k of ["dues_amount_cents", "national_youth_cents", "national_adult_cents", "council_youth_cents", "council_adult_cents"]) {
    const raw = String(form.get(k) ?? "").trim();
    const c = raw ? parseDollars(raw) : 0;
    if (c === null) return { error: "Write amounts in dollars, like 60 or 12.50 (up to $1,000)." };
    values[k] = String(c);
  }
  values.pay_other_how = String(form.get("pay_other_how") ?? "").trim().slice(0, 600);
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_pay_settings", { p_values: values });
  if (error) return { error: error.code === "22023" ? error.message : "Couldn't save settings." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved" };
}
