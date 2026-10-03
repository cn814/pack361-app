"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/data";
import { getCatalog, getScout, isAdmin } from "@/lib/advancement-data";
import { parseScoutbookExport, RANKS } from "@/lib/advancement";
import type { DenRank } from "@/lib/types";
import type { ImportChanges } from "@/lib/import-changes";

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
export async function reviewSubmissions(form: FormData) {
  await requireMember();
  const ids = form.getAll("id").map(String).filter(Boolean);
  const decision = String(form.get("decision") ?? "");
  const note = String(form.get("review_note") ?? "").trim().slice(0, 500) || null;
  const status = decision === "approve" ? "approved" : decision === "return" ? "returned" : decision === "record" ? "recorded" : null;
  if (!ids.length || !status) return;
  const supabase = await createClient();
  const update: Record<string, unknown> = { status };
  if (status !== "recorded") update.review_note = note;
  await supabase.from("advancement_submissions").update(update).in("id", ids);
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
  if (!isAdmin(me)) return { error: "Only pack admins can import." };
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

  const supabase = await createClient();
  const { count: before } = await supabase
    .from("advancement_submissions")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved");
  const { data, error } = await supabase.rpc("import_scout_advancement", {
    p_file_name: file.name.slice(0, 200),
    p_rows: parsed.rows,
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
