"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/ActionForm";
import { displayName, isCommittee, requireMember } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { parseAmount, seasonRange } from "@/lib/finance";
import { readRequestFields } from "@/lib/finance-form";
import { checkUploadedReceipt, isOwnReceiptPath, removeReceipts } from "@/lib/finance-receipts";
import { notifyDecision, notifyNewRequest } from "@/lib/finance-notify";
import { todayEastern } from "@/lib/money-data";

const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PAID_VIA = ["check", "cash", "paypal", "zelle", "venmo", "card", "transfer", "other"];
const RECEIVED_VIA = ["check", "cash", "deposit", "paypal", "other"];
const BASE = "/leaders/money/expenses";

async function requireLeadership() {
  const me = await requireMember();
  if (!isCommittee(me)) redirect("/leaders");
  return me;
}

function refresh() {
  revalidatePath("/leaders/money", "layout");
  revalidatePath("/reimburse", "layout");
  revalidatePath("/leaders");
}

/** A safe place to go back to inside the expenses pages. */
function backTo(form: FormData, fallback = BASE): string {
  const b = String(form.get("back") ?? "");
  return b.startsWith(`${BASE}`) && !b.includes("//") ? b : fallback;
}

/** Explain a database refusal in plain words. */
function why(error: { code?: string; message?: string } | null, fallback: string): string {
  if (!error) return fallback;
  if (error.code === "42501" && /own request/.test(error.message ?? "")) return `${error.message}.`;
  if (error.code === "22023") return error.message ?? fallback;
  if (error.code === "23514") return "Pick a budget category before approving or paying it.";
  return fallback;
}

/** Read the paid-with fields. */
function readPaid(form: FormData): { error: string } | { paid_via: string; paid_on: string; paid_ref: string | null } {
  const via = String(form.get("paid_via") ?? "");
  const on = String(form.get("paid_on") ?? "");
  const ref = String(form.get("paid_ref") ?? "").trim().slice(0, 60) || null;
  if (!PAID_VIA.includes(via)) return { error: "Choose how it was paid." };
  if (!DATE.test(on) || on > todayEastern()) return { error: "Pick the date it was paid (not in the future)." };
  return { paid_via: via, paid_on: on, paid_ref: ref };
}

/**
 * Review a request: approve (with a category), decline (with a reason), mark paid back, or
 * send it back to waiting. The database records who did what, and refuses anyone handling
 * their own request.
 */
export async function reviewExpense(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireLeadership();
  const id = String(form.get("id") ?? "");
  const act = String(form.get("do") ?? "");
  if (!UUID.test(id)) return { error: "Expense not found." };
  const supabase = await createClient();
  const { data: e } = await supabase
    .from("expenses")
    .select("id, status, paid_by, adult_id, amount_cents, description, category_id")
    .eq("id", id)
    .maybeSingle();
  if (!e) return { error: "Expense not found." };

  const categoryId = String(form.get("category_id") ?? "");
  if (categoryId && !UUID.test(categoryId)) return { error: "Pick a category from the list." };
  const note = String(form.get("review_note") ?? "").replace(/\r/g, "").trim().slice(0, 500);
  const patch: Record<string, unknown> = {};
  if (categoryId) patch.category_id = categoryId;
  if (note) patch.review_note = note;

  if (act === "approve") {
    if (e.status !== "submitted") return { error: "It isn't waiting for review any more." };
    patch.status = "approved";
  } else if (act === "pay") {
    if (e.status !== "submitted" && e.status !== "approved") return { error: "It can't be paid from here." };
    const paid = readPaid(form);
    if ("error" in paid) return paid;
    Object.assign(patch, paid, { status: "paid" });
  } else if (act === "decline") {
    if (e.status !== "submitted" && e.status !== "approved") return { error: "It can't be declined now." };
    if (!note) return { error: "Say why, so they know (it's sent to them)." };
    patch.status = "declined";
  } else if (act === "reopen") {
    if (e.paid_by !== "member" || (e.status !== "declined" && e.status !== "approved" && e.status !== "paid")) {
      return { error: "It can't be reopened." };
    }
    patch.status = "submitted";
  } else {
    return { error: "Choose what to do." };
  }

  const { data, error } = await supabase.from("expenses").update(patch).eq("id", id).select("id").maybeSingle();
  if (error || !data) return { error: why(error, "Couldn't save that. Try again.") };
  if ((act === "pay" || act === "decline") && e.paid_by === "member" && e.adult_id) {
    await notifyDecision({
      adultId: e.adult_id as string,
      amountCents: e.amount_cents as number,
      description: e.description as string,
      outcome: act === "pay" ? "paid" : "declined",
      paidVia: (patch.paid_via as never) ?? null,
      paidOn: (patch.paid_on as string) ?? null,
      reason: act === "decline" ? note : null,
    });
  }
  refresh();
  const message = { approve: "Approved. It's in the list to pay.", pay: "Marked paid back.", decline: "Declined. They've been told.", reopen: "Back to waiting for review." }[act];
  return { ok: true, message };
}

/** Leadership: record an expense (pack spending, or someone to pay back) or change one. */
export async function saveExpense(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireLeadership();
  const newPath = String(form.get("receipt_path") ?? "");
  const fail = async (error: string): Promise<ActionResult> => {
    if (newPath && isOwnReceiptPath(newPath, me.id)) await removeReceipts([newPath]);
    return { error };
  };
  const id = String(form.get("id") ?? "");
  if (id && !UUID.test(id)) return fail("Expense not found.");
  const fields = readRequestFields(form);
  if ("error" in fields) return fail(fields.error);
  if (!fields.row.category_id) return fail("Pick a budget category.");
  const row: Record<string, unknown> = {
    ...fields.row,
    review_note: String(form.get("review_note") ?? "").replace(/\r/g, "").trim().slice(0, 500) || null,
  };

  const supabase = await createClient();
  type Old = { paid_by: string; status: string; receipt_path: string | null };
  let old: Old | null = null;
  if (id) {
    const { data } = await supabase.from("expenses").select("paid_by, status, receipt_path").eq("id", id).maybeSingle();
    if (!data) return fail("Expense not found.");
    old = data as Old;
    // Pack spending and paid-back requests keep their paid details up to date.
    if (old.status === "paid") {
      const paid = readPaid(form);
      if ("error" in paid) return fail(paid.error);
      Object.assign(row, paid);
    }
  } else {
    const who = String(form.get("who") ?? "pack");
    if (who === "pack") {
      const paid = readPaid(form);
      if ("error" in paid) return fail(paid.error);
      Object.assign(row, paid, { paid_by: "pack", adult_id: null, status: "paid" });
    } else {
      if (!UUID.test(who)) return fail("Choose who paid.");
      const already = form.get("already_paid") === "on";
      if (who === me.id && already) return fail("Another key leader has to record paying you back.");
      Object.assign(row, { paid_by: "member", adult_id: who, status: who === me.id ? "submitted" : already ? "paid" : "approved" });
      if (already) {
        const paid = readPaid(form);
        if ("error" in paid) return fail(paid.error);
        Object.assign(row, paid);
      }
    }
  }

  if (newPath) {
    const r = await checkUploadedReceipt(supabase, newPath, me.id, String(form.get("receipt_name") ?? ""));
    if ("error" in r) return fail(r.error);
    Object.assign(row, r);
  }

  if (!id) {
    const { error } = await supabase.from("expenses").insert(row);
    if (error) return fail(why(error, "Couldn't save that expense. Try again."));
    // Your own request waits for another leadership member: tell the treasurer.
    if (row.status === "submitted") {
      await notifyNewRequest({
        who: `${displayName(me)} ${me.last_name}`,
        amountCents: row.amount_cents as number,
        description: row.description as string,
        requesterId: me.id,
      });
    }
  } else {
    const { data, error } = await supabase.from("expenses").update(row).eq("id", id).select("id").maybeSingle();
    if (error || !data) return fail(why(error, "Couldn't save your changes. Try again."));
    if (newPath && old?.receipt_path && old.receipt_path !== newPath) await removeReceipts([old.receipt_path]);
  }
  refresh();
  const back = backTo(form, `${BASE}?tab=expenses`);
  redirect(`${back}${back.includes("?") ? "&" : "?"}note=${id ? "Saved" : "Expense+recorded"}`);
}

/** Leadership: delete an expense for good (a mistake or a duplicate), and its receipt. */
export async function deleteExpense(form: FormData) {
  await requireLeadership();
  const id = String(form.get("id") ?? "");
  const back = backTo(form, `${BASE}?tab=expenses`);
  if (!UUID.test(id)) redirect(back);
  const supabase = await createClient();
  const { data } = await supabase.from("expenses").delete().eq("id", id).select("receipt_path");
  if (data?.length) await removeReceipts(data.map((d) => d.receipt_path as string | null));
  refresh();
  redirect(`${back}${back.includes("?") ? "&" : "?"}note=Deleted`);
}

/** Leadership: record money in that the app doesn't see on its own. */
export async function saveIncome(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireLeadership();
  const id = String(form.get("id") ?? "");
  const receivedOn = String(form.get("received_on") ?? "");
  const amount = parseAmount(String(form.get("amount") ?? ""));
  const categoryId = String(form.get("category_id") ?? "");
  const description = String(form.get("description") ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const via = String(form.get("received_via") ?? "");
  if (id && !UUID.test(id)) return { error: "Income not found." };
  if (!DATE.test(receivedOn) || receivedOn > todayEastern()) return { error: "Pick the date it came in (not in the future)." };
  if (amount === null) return { error: "Write the amount in dollars, like 250 or 12.50." };
  if (!UUID.test(categoryId)) return { error: "Pick a category." };
  if (!description) return { error: "Say what it was (who it came from, what for)." };
  if (via && !RECEIVED_VIA.includes(via)) return { error: "Choose how it came in." };
  const row = {
    received_on: receivedOn,
    amount_cents: amount,
    category_id: categoryId,
    description,
    received_via: via || null,
    reference: String(form.get("reference") ?? "").trim().slice(0, 60) || null,
    note: String(form.get("note") ?? "").replace(/\r/g, "").trim().slice(0, 500) || null,
  };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("finance_income").update(row).eq("id", id) : await supabase.from("finance_income").insert(row);
  if (error) return { error: why(error, "Couldn't save that. Try again.") };
  refresh();
  return { ok: true, message: id ? "Saved" : "Income recorded" };
}

export async function deleteIncome(form: FormData) {
  await requireLeadership();
  const id = String(form.get("id") ?? "");
  if (UUID.test(id)) {
    const supabase = await createClient();
    await supabase.from("finance_income").delete().eq("id", id);
    refresh();
  }
  redirect(`${BASE}?tab=income&note=Deleted`);
}

/** Leadership: the budget for one season (blank = no budget for that line). */
export async function saveBudget(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireLeadership();
  const season = String(form.get("season") ?? "");
  if (!seasonRange(season)) return { error: "Pick a season like 2026-27." };
  const upserts: { season: string; category_id: string; amount_cents: number }[] = [];
  const clear: string[] = [];
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("b_")) continue;
    const cat = k.slice(2);
    if (!UUID.test(cat)) continue;
    const raw = String(v).trim();
    if (!raw) {
      clear.push(cat);
      continue;
    }
    const c = raw.replace(/[$,\s]/g, "") === "0" ? 0 : parseAmount(raw);
    if (c === null) return { error: "Write budget amounts in dollars, like 600 or 1,250." };
    upserts.push({ season, category_id: cat, amount_cents: c });
  }
  const supabase = await createClient();
  if (upserts.length) {
    const { error } = await supabase.from("finance_budget").upsert(upserts, { onConflict: "season,category_id" });
    if (error) return { error: "Couldn't save the budget. Try again." };
  }
  if (clear.length) await supabase.from("finance_budget").delete().eq("season", season).in("category_id", clear);
  refresh();
  return { ok: true, message: `Budget for ${season} saved` };
}

/** Leadership: add a category, rename one, or hide it from the lists (it stays in old reports). */
export async function saveCategory(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireLeadership();
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  const kind = String(form.get("kind") ?? "");
  const supabase = await createClient();
  if (id) {
    if (!UUID.test(id)) return { error: "Category not found." };
    if (!name) return { error: "Give it a name." };
    const { error } = await supabase.from("finance_categories").update({ name }).eq("id", id);
    if (error) return { error: error.code === "23505" ? "There's already a category with that name." : "Couldn't save that." };
  } else {
    if (kind !== "income" && kind !== "expense") return { error: "Choose money in or money out." };
    if (!name) return { error: "Give it a name." };
    const { error } = await supabase.from("finance_categories").insert({ kind, name, sort: 500 });
    if (error) return { error: error.code === "23505" ? "There's already a category with that name." : "Couldn't add that." };
  }
  refresh();
  return { ok: true, message: id ? "Renamed" : "Added" };
}

/** Leadership: hide a category from the lists (it stays in old reports), or show it again. */
export async function toggleCategory(form: FormData) {
  await requireLeadership();
  const id = String(form.get("id") ?? "");
  const hide = form.get("do") === "hide";
  const season = String(form.get("season") ?? "");
  if (UUID.test(id)) {
    const supabase = await createClient();
    await supabase.from("finance_categories").update({ archived_at: hide ? new Date().toISOString() : null }).eq("id", id);
    refresh();
  }
  redirect(`${BASE}?tab=budget${seasonRange(season) ? `&season=${season}` : ""}&note=${hide ? "Category+hidden" : "Category+shown"}`);
}
