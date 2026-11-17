"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isLeader, requireMember } from "@/lib/data";
import { APP_URL, sendEmails } from "@/lib/email";
import type { ActionResult } from "@/components/ActionForm";
import { getAwardsToHandOut, getCatalog, getOwedAwards, getPurchasedAwards, getReviewableScouts, getScout, isAdvancement } from "@/lib/advancement-data";
import { getSettings } from "@/lib/settings";
import { awardLabel, parseScoutbookExport, RANKS, type ImportRow } from "@/lib/advancement";
import type { DenRank } from "@/lib/types";
import type { ImportChanges } from "@/lib/import-changes";
import { alertReviewed } from "@/lib/family-alerts";

export type FormState = { ok?: boolean; error?: string; message?: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parent reports one or more requirements of an adventure. RLS limits this to their own scouts. */
export async function reportRequirements(_prev: FormState, form: FormData): Promise<FormState> {
  const me = await requireMember();
  const scoutId = String(form.get("scout_id") ?? "");
  const rank = String(form.get("rank") ?? "") as DenRank;
  const adventure = String(form.get("adventure") ?? "");
  const completedOn = String(form.get("completed_on") ?? "");
  const notes = String(form.get("notes") ?? "").trim().slice(0, 1000) || null;
  const reqs = form.getAll("requirement").map(String);

  if (!RANKS.includes(rank)) return { error: "Pick a rank." };
  const catalog = await getCatalog();
  const adv = catalog.find((a) => a.rank === rank && a.name === adventure);
  if (!adv) return { error: "Pick an adventure." };
  const valid = reqs.filter((r) => /^\d{1,2}$/.test(r) && Number(r) >= 1 && Number(r) <= adv.req_count);
  if (!valid.length) return { error: "Check at least one requirement." };
  if (!ISO_DATE.test(completedOn)) return { error: "Add the date it was finished." };
  const scout = await getScout(scoutId);
  if (!scout) return { error: "Scout not found." };

  const supabase = await createClient();
  const { error } = await supabase.from("advancement_submissions").insert(
    valid.map((r) => ({
      scout_id: scoutId,
      submitted_by: me.id,
      rank,
      adventure,
      requirement: r,
      completed_on: completedOn,
      notes,
    })),
  );
  if (error) return { error: "Couldn't send that. Only a scout's own family can report requirements." };
  revalidatePath(`/scouts/${scoutId}`);
  revalidatePath("/scouts");
  redirect(`/scouts/${scoutId}?reported=${valid.length}`);
}

/** Leaders: approve / return / mark recorded. RLS (can_review_scout) decides who may. */
const SUBMISSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function reviewSubmissions(form: FormData) {
  const me = await requireMember();
  const ids = [...new Set(form.getAll("id").map(String).filter((x) => SUBMISSION_ID.test(x)))].slice(0, 500);
  const decision = String(form.get("decision") ?? "");
  const note = String(form.get("review_note") ?? "").trim().slice(0, 500) || null;
  const status = decision === "approve" ? "approved" : decision === "return" ? "returned" : decision === "record" ? "recorded" : null;
  if (!ids.length || !status) return;
  const supabase = await createClient();
  // Before the change: which of these are families' own reports whose status actually changes
  // (den-meeting entries and repeat taps don't alert anyone).
  const { data: before } =
    status === "recorded"
      ? { data: [] }
      : await supabase.from("advancement_submissions").select("id, scout_id, adventure, requirement, status, meeting_id").in("id", ids);
  const update: Record<string, unknown> = { status };
  if (status !== "recorded") update.review_note = note;
  const { data: saved, error } = await supabase.from("advancement_submissions").update(update).in("id", ids).select("id");
  // A plain form action has no result to show, so throw: the page's error screen says it
  // didn't save (with Try again) instead of the report silently staying put.
  if (error) throw new Error("Couldn't save the review.");
  revalidatePath("/scouts", "layout");

  if (status === "approved" || status === "returned") {
    const changed = new Set(((saved ?? []) as { id: string }[]).map((r) => r.id));
    const reports = ((before ?? []) as { id: string; scout_id: string; adventure: string; requirement: string; status: string; meeting_id: string | null }[])
      .filter((r) => changed.has(r.id) && r.status !== status && !r.meeting_id);
    if (reports.length) {
      after(async () => {
        try {
          await alertReviewed(reports, status, note, me.id);
        } catch (e) {
          console.error("[review alerts]", e instanceof Error ? e.message : e);
        }
      });
    }
  }
}

/**
 * Leaders: undo "Entered in Scoutbook" (a mistaken tap). Back to approved, still approved by
 * whoever approved it (the database keeps that). No one is alerted. RLS decides who may.
 */
export async function undoEntered(form: FormData) {
  await requireMember();
  const ids = [...new Set(form.getAll("id").map(String).filter((x) => SUBMISSION_ID.test(x)))].slice(0, 500);
  if (!ids.length) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("advancement_submissions")
    .update({ status: "approved" })
    .in("id", ids)
    .eq("status", "recorded");
  if (error) throw new Error("Couldn't undo that.");
  revalidatePath("/scouts", "layout");
}

/** Family withdraws a report that hasn't been reviewed yet. */
export async function withdrawSubmission(form: FormData) {
  await requireMember();
  const id = String(form.get("id") ?? "");
  const scoutId = String(form.get("scout_id") ?? "");
  const supabase = await createClient();
  await supabase.from("advancement_submissions").delete().eq("id", id).eq("status", "submitted");
  revalidatePath(`/scouts/${scoutId}`);
}

export type ImportState = FormState & {
  rows?: number;
  scouts?: number;
  unmatched?: { member_id: string; name: string }[];
  recorded?: number;
  changes?: ImportChanges | null;
};

/** Admin uploads Scoutbook Plus -> Reports -> Quick Export -> Advancements. */
export async function importScoutbook(_prev: ImportState, form: FormData): Promise<ImportState> {
  const me = await requireMember();
  if (!isAdvancement(me)) return { error: "Only admins and the Advancement Chair can import." };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the CSV file first." };
  if (file.size > 3_500_000) return { error: "That file is bigger than a Scoutbook advancement export should be." };

  let parsed;
  try {
    parsed = parseScoutbookExport(await file.text(), await getCatalog());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't read that file." };
  }
  if (!parsed.rows.length) return { error: "No advancement rows found in that file." };
  return runImport(file.name.slice(0, 200), parsed.rows);
}

/** Save advancement rows (from the CSV or read from Scoutbook) and report what changed. */
async function runImport(fileName: string, rows: ImportRow[]): Promise<ImportState> {
  const supabase = await createClient();
  const { count: before } = await supabase
    .from("advancement_submissions")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved");
  const { data, error } = await supabase.rpc("import_scout_advancement", {
    p_file_name: fileName,
    p_rows: rows,
  });
  if (error) return { error: `Import failed: ${error.message}` };
  const { count: after } = await supabase
    .from("advancement_submissions")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved");

  const log = data as { row_count: number; scout_count: number; unmatched: { member_id: string; name: string }[]; changes?: ImportChanges | null };
  revalidatePath("/scouts", "layout");
  return {
    ok: true,
    rows: log.row_count,
    scouts: log.scout_count,
    unmatched: log.unmatched,
    recorded: Math.max(0, (before ?? 0) - (after ?? 0)),
    changes: log.changes ?? null,
  };
}


// ---------------------------------------------------------------------------
// Awards night: who wasn't there, and what they're still owed
// ---------------------------------------------------------------------------
const awardsScout = (form: FormData) => {
  const id = String(form.get("scout_id") ?? "");
  return SUBMISSION_ID.test(id) ? id : null;
};

/** "Awarded": this scout got tonight's awards. RLS decides who may. */
export async function markAwarded(form: FormData) {
  await requireMember();
  const scoutId = awardsScout(form);
  if (!scoutId) return;
  const settings = await getSettings();
  const labels = [...new Set((await getAwardsToHandOut([scoutId], settings.awards_tracked_from)).map((r) => awardLabel(r).slice(0, 200)))];
  const supabase = await createClient();
  const { data: have } = await supabase.from("awards_given").select("label").eq("scout_id", scoutId);
  const done = new Set(((have ?? []) as { label: string }[]).map((r) => r.label));
  const rows = labels.filter((l) => !done.has(l)).map((label) => ({ scout_id: scoutId, label }));
  if (rows.length) {
    const { error } = await supabase.from("awards_given").insert(rows);
    if (error) throw new Error("Couldn't save that.");
  }
  // Anything they were still owed from before was handed over too.
  await supabase.from("awards_owed").update({ given_at: new Date().toISOString() }).eq("scout_id", scoutId).is("given_at", null);
  revalidatePath("/scouts/awards", "layout");
}

/** Undo "Awarded" for tonight's awards (a mistaken tap). */
export async function unmarkAwarded(form: FormData) {
  await requireMember();
  const scoutId = awardsScout(form);
  if (!scoutId) return;
  const settings = await getSettings();
  const labels = (await getAwardsToHandOut([scoutId], settings.awards_tracked_from)).map(awardLabel);
  if (!labels.length) return;
  const supabase = await createClient();
  const { error } = await supabase.from("awards_given").delete().eq("scout_id", scoutId).in("label", labels);
  if (error) throw new Error("Couldn't undo that.");
  revalidatePath("/scouts/awards", "layout");
}

/**
 * "Finish awards night": every award on the list that nobody marked Awarded goes on the Still
 * owed list, where it stays (even after Scoutbook marks it awarded) until someone taps Given.
 */
export async function finishAwardsNight(): Promise<ActionResult> {
  const me = await requireMember();
  if (!isLeader(me)) return { error: "For leaders." };
  const [scouts, settings] = await Promise.all([getReviewableScouts(), getSettings()]);
  const ids = scouts.map((s) => s.id);
  const items = await getAwardsToHandOut(ids, settings.awards_tracked_from);
  const supabase = await createClient();
  const [{ data: given }, owed] = await Promise.all([
    supabase.from("awards_given").select("scout_id, label").in("scout_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    getOwedAwards(ids),
  ]);
  const skip = new Set([...((given ?? []) as { scout_id: string; label: string }[]), ...owed].map((r) => `${r.scout_id}|${r.label}`));
  const rows = [
    ...new Map(
      items
        .map((r) => ({ scout_id: r.scout_id, label: awardLabel(r).slice(0, 200), kind: r.kind, completed_on: r.completed_on }))
        .filter((r) => !skip.has(`${r.scout_id}|${r.label}`))
        .map((r) => [`${r.scout_id}|${r.label}`, r]),
    ).values(),
  ];
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("awards_owed").insert(rows.slice(i, i + 500));
    if (error) return { error: "Couldn't save that. Try again." };
  }
  revalidatePath("/scouts/awards", "layout");
  const n = new Set(rows.map((r) => r.scout_id)).size;
  return { ok: true, message: n ? `${n} scout${n === 1 ? "" : "s"} moved to Still owed.` : "Everyone was awarded. Nothing is owed." };
}

/** "Given": the scout got what they were owed. */
export async function markOwedGiven(form: FormData) {
  await requireMember();
  const scoutId = awardsScout(form);
  if (!scoutId) return;
  const supabase = await createClient();
  const { error } = await supabase.from("awards_owed").update({ given_at: new Date().toISOString() }).eq("scout_id", scoutId).is("given_at", null);
  if (error) throw new Error("Couldn't save that.");
  revalidatePath("/scouts/awards", "layout");
}

/**
 * Leaders on a phone: email themselves the link to Enter in Scoutbook, to open later on a
 * computer beside Scoutbook Plus.
 */
export async function emailMeScoutbookLink(): Promise<ActionResult> {
  const me = await requireMember();
  if (!isLeader(me)) return { error: "For leaders." };
  const supabase = await createClient();
  const { count } = await supabase.from("advancement_submissions").select("id", { count: "exact", head: true }).eq("status", "approved");
  const n = count ?? 0;
  const error = await sendEmails([
    {
      to: me.email,
      subject: "Enter in Scoutbook: open this on a computer",
      paragraphs: [
        `Hi ${me.preferred_name || me.first_name},`,
        `${n} approved item${n === 1 ? " is" : "s are"} waiting to be entered in Scoutbook Plus. It's easiest on a computer: open Scoutbook Plus in one window and this link in another. The app lays the list out like Scoutbook's screens, one adventure at a time with the scouts and dates to tick.`,
        `${APP_URL}/scouts/review#record`,
      ],
    },
  ]);
  return error ? { error } : { ok: true, message: `Sent to ${me.email}` };
}

// ---------------------------------------------------------------------------
// Scout Shop: what's already been purchased
// ---------------------------------------------------------------------------
async function shoppingList() {
  const [scouts, settings] = await Promise.all([getReviewableScouts(), getSettings()]);
  const ids = scouts.map((s) => s.id);
  const [items, purchased] = await Promise.all([getAwardsToHandOut(ids, settings.awards_tracked_from), getPurchasedAwards(ids)]);
  const onList = new Map(items.map((r) => [`${r.scout_id}|${awardLabel(r)}`, { scout_id: r.scout_id, label: awardLabel(r).slice(0, 200) }]));
  return { onList, purchased };
}

/** After shopping (or printing the list): everything on the shopping list is purchased. */
export async function markAllPurchased(): Promise<ActionResult> {
  const me = await requireMember();
  if (!isLeader(me)) return { error: "For leaders." };
  const { onList, purchased } = await shoppingList();
  const have = new Set(purchased.map((p) => `${p.scout_id}|${p.label}`));
  const rows = [...onList.entries()].filter(([k]) => !have.has(k)).map(([, v]) => v);
  if (rows.length) {
    const supabase = await createClient();
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from("awards_bought").insert(rows.slice(i, i + 500));
      if (error) return { error: "Couldn't save that. Try again." };
    }
  }
  revalidatePath("/scouts/awards", "layout");
  return { ok: true, message: `${rows.length} award${rows.length === 1 ? "" : "s"} marked purchased.` };
}

/** Not purchased after all: everything under Already purchased goes back on the list to buy. */
export async function unmarkPurchased() {
  const me = await requireMember();
  if (!isLeader(me)) return;
  const { onList, purchased } = await shoppingList();
  const ids = purchased.filter((p) => onList.has(`${p.scout_id}|${p.label}`)).map((p) => p.id);
  if (!ids.length) return;
  const supabase = await createClient();
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase.from("awards_bought").delete().in("id", ids.slice(i, i + 200));
    if (error) throw new Error("Couldn't undo that.");
  }
  revalidatePath("/scouts/awards", "layout");
}
