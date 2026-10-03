import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rowsFromLines, type CatalogAdventure } from "./advancement";
import { fetchMyScoutingTraining, fetchScoutbookAdvancement, myScoutingConfigured } from "./myscouting";
import { compareAdvancement } from "./scoutbook-compare";
import { buildPlan, type RosterAdult } from "./training-import";
import { today, type TrainingRow } from "./training";
import { changesText, type ImportChanges } from "./import-changes";
import { sendPushTo } from "./push";
import { APP_URL, emailConfigured, sendEmails } from "./email";

// The weekly Scoutbook job (Sunday night, /api/cron/scoutbook), when Pack admin has turned it on
// (Scouts → Import from Scoutbook). It runs the same two imports a leader can run by hand:
//   1. Advancement: everyone's completed ranks, adventures, requirements and awards. As a safety
//      check, it holds off (and tells the admins) if it would remove more than a few records,
//      which would mean Scoutbook answered in a way this app doesn't expect.
//   2. Training: Safeguarding Youth dates, newer ones only. Rows whose name doesn't match the app
//      wait for a leader to confirm them by hand.
// The result is saved as the "scoutbook_weekly_last" setting and sent to the pack admins when
// something changed or needs a look.

export interface WeeklyResult {
  at: string;
  advancement: { ok?: boolean; records?: number; scouts?: number; changes?: ImportChanges | null; skipped?: number; held?: string; error?: string };
  training: { ok?: boolean; updated?: number; waiting?: number; memberIds?: number; error?: string };
}

const REMOVE_LIMIT = (existing: number) => Math.max(25, Math.round(existing * 0.03));

export async function weeklyScoutbook(db: SupabaseClient): Promise<WeeklyResult | { skipped: string }> {
  const { data: setting } = await db.from("pack_settings").select("value").eq("key", "scoutbook_weekly").maybeSingle();
  if ((setting?.value as string | undefined) !== "on") return { skipped: "turned off" };
  if (!myScoutingConfigured()) return { skipped: "no Scoutbook login saved" };

  const result: WeeklyResult = { at: new Date().toISOString(), advancement: {}, training: {} };
  // Both reads share the cron's 300 seconds: advancement may read until 200s (leaving time to
  // compare and import), training until 270s, so the result is always saved and reported.
  const started = Date.now();

  // 1. Advancement
  try {
    const sync = await fetchScoutbookAdvancement({ deadline: started + 200_000 });
    if (sync.error) throw new Error(sync.error);
    const { data: catalog } = await db.from("adventures").select("rank, name, required, req_count, special, sort_order").order("sort_order");
    const { rows } = rowsFromLines(sync.lines, (catalog ?? []) as CatalogAdventure[]);
    if (!rows.length) throw new Error("Scoutbook didn't return any completed advancement.");
    const cmp = await compareAdvancement(rows, db);
    const limit = REMOVE_LIMIT(cmp.same + cmp.changed + cmp.removed);
    result.advancement.skipped = sync.skipped.length;
    if (cmp.removed > limit) {
      result.advancement.held = `It would have removed ${cmp.removed} records (more than ${limit}), so nothing was changed. Run Compare on the import page to see why.`;
    } else {
      const { data, error } = await db.rpc("import_scout_advancement", { p_file_name: "Scoutbook (weekly)", p_rows: rows });
      if (error) throw new Error(error.message);
      const log = data as { row_count: number; scout_count: number; changes?: ImportChanges | null };
      Object.assign(result.advancement, { ok: true, records: log.row_count, scouts: log.scout_count, changes: log.changes ?? null });
    }
  } catch (e) {
    result.advancement.error = e instanceof Error ? e.message : "failed";
  }

  // 2. Training (Safeguarding Youth)
  try {
    const sync = await fetchMyScoutingTraining({ deadline: Math.min(started + 270_000, Date.now() + 90_000) });
    if (sync.error) throw new Error(sync.error);
    const [{ data: adults }, { data: trainings }] = await Promise.all([
      db.from("adults").select("id, first_name, last_name, preferred_name, bsa_member_id, other_names").eq("is_active", true),
      db.from("adult_trainings").select("adult_id, course, completed_on, expires_on"),
    ]);
    const by = new Map<string, TrainingRow[]>();
    for (const t of (trainings ?? []) as TrainingRow[]) by.set(t.adult_id, [...(by.get(t.adult_id) ?? []), t]);
    const roster = ((adults ?? []) as Omit<RosterAdult, "trainings">[]).map((a) => ({ ...a, trainings: by.get(a.id) ?? [] }));
    const plan = buildPlan(sync.rows, roster, today());
    const sure = plan.updates.filter((u) => !u.warn);
    const ids = plan.memberIdOffers.map((o) => ({ adult_id: o.adultId, member_id: o.memberId }));
    let updated = 0;
    let memberIds = 0;
    if (sure.length || ids.length) {
      const { data, error } = await db.rpc("import_trainings", {
        p_rows: sure.map((u) => ({ adult_id: u.adultId, course: u.course, completed_on: u.completed, expires_on: u.expires })),
        p_member_ids: ids,
      });
      if (error) throw new Error(error.message);
      updated = Number((data as { trainings?: number })?.trainings ?? 0);
      memberIds = Number((data as { member_ids?: number })?.member_ids ?? 0);
    }
    Object.assign(result.training, { ok: true, updated, waiting: plan.updates.length - sure.length, memberIds });
  } catch (e) {
    result.training.error = e instanceof Error ? e.message : "failed";
  }

  await db.from("pack_settings").upsert({ key: "scoutbook_weekly_last", value: JSON.stringify(result), updated_at: new Date().toISOString() });
  await tellAdmins(db, result);
  return result;
}

/** One line per part, for the page and the admins' message. */
export function weeklySummary(r: WeeklyResult): string[] {
  const a = r.advancement;
  const t = r.training;
  return [
    a.error
      ? `Advancement: didn't run (${a.error}).`
      : a.held
        ? `Advancement: held. ${a.held}`
        : `Advancement: ${a.records?.toLocaleString()} records for ${a.scouts} scouts. ${changesText(a.changes) ?? ""}${a.skipped ? ` ${a.skipped} scouts skipped (Scoutbook didn't answer); they kept their records.` : ""}`,
    t.error
      ? `Training: didn't run (${t.error}).`
      : `Training: ${t.updated ? `${t.updated} Safeguarding Youth date${t.updated === 1 ? "" : "s"} updated` : "no new Safeguarding Youth dates"}.${t.waiting ? ` ${t.waiting} wait for a leader to confirm a name (Pack → Training → Import).` : ""}`,
  ];
}

async function tellAdmins(db: SupabaseClient, r: WeeklyResult) {
  const a = r.advancement;
  const changed = (a.changes && (a.changes.new || a.changes.changed || a.changes.removed)) || r.training.updated;
  const problem = a.error || a.held || r.training.error || r.training.waiting;
  if (!changed && !problem) return;
  const { data } = await db.from("adults").select("id, email, first_name, preferred_name").eq("is_active", true).eq("role", "admin");
  const admins = (data ?? []) as { id: string; email: string; first_name: string; preferred_name: string | null }[];
  if (!admins.length) return;
  const lines = weeklySummary(r);
  await sendPushTo(
    admins.map((x) => x.id),
    { title: problem ? "Weekly Scoutbook update needs a look" : "Weekly Scoutbook update", body: lines.join(" "), url: "/scouts/import", tag: "scoutbook-weekly" },
  );
  if (emailConfigured()) {
    await sendEmails(
      admins.map((x) => ({
        to: x.email,
        subject: problem ? "Pack 361 app: weekly Scoutbook update needs a look" : "Pack 361 app: weekly Scoutbook update",
        paragraphs: [`Hi ${x.preferred_name || x.first_name},`, ...lines, `${APP_URL}/scouts/import`],
      })),
    );
  }
}
