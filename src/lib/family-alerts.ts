import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminConfigured, createAdminClient } from "./supabase/admin";
import { sendPushTo } from "./push";
import { easternDate } from "./tz";
import type { ImportRow } from "./advancement";
import type { DenRank } from "./types";
import { RANK_GROUP, andList, clip, daysAgo, earnedMessage, meetingWhen, newlyEarned, type EarnedRow } from "./reminder-logic";

// Advancement alerts for families, by push to the active adults of the scout's family (never to
// scouts: scouts have no accounts). Pushes only: these come from a leader's action or the weekly
// import, not the daily cron, so they don't touch the daily reminder email budget; the Sunday
// newsletter ("Your scout this week") is the email version.
//   1. alertDenMeeting    after a den meeting is saved with adventure work: what the den worked
//                         on, to families of scouts who were there; how to finish it at home, to
//                         families of active den scouts who missed it. Once per scout and meeting
//                         (meeting_family_alerts), and only for meetings in the last few days.
//   2. alertReviewed      when a leader approves or returns a family's report.
//   3. alertNewlyEarned   after the weekly Scoutbook import: adventures and ranks new in Scoutbook.

/** Adults of these families, active only, grouped by family. */
async function familyAdults(db: SupabaseClient, familyIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < familyIds.length; i += 200) {
    const { data } = await db.from("adults").select("id, family_id").in("family_id", familyIds.slice(i, i + 200)).eq("is_active", true);
    for (const a of (data ?? []) as { id: string; family_id: string }[]) out.set(a.family_id, [...(out.get(a.family_id) ?? []), a.id]);
  }
  return out;
}

function serverDb(): SupabaseClient | null {
  return adminConfigured() ? createAdminClient() : null;
}

// ---------------------------------------------------------------------------
// 1. Den meetings
// ---------------------------------------------------------------------------
/** Meetings saved more than this many days after they happened don't alert families. */
const MEETING_ALERT_DAYS = 3;

export async function alertDenMeeting(meetingId: string, exceptAdultId?: string) {
  const db = serverDb();
  if (!db) return { skipped: "no server key" };
  const { data: m } = await db
    .from("den_meetings")
    .select("id, den_id, meets_on, adventure, work, den:dens(name, rank)")
    .eq("id", meetingId)
    .maybeSingle();
  const meeting = m as unknown as {
    id: string;
    den_id: string;
    meets_on: string;
    adventure: string | null;
    work: { adventure: string; requirements?: string[] }[] | null;
    den: { name: string; rank: DenRank } | null;
  } | null;
  if (!meeting?.den) return { skipped: "meeting not found" };
  const today = easternDate(Date.now());
  if (daysAgo(meeting.meets_on, today) > MEETING_ALERT_DAYS) return { skipped: "older meeting" };
  const adventures = [...new Set((meeting.work ?? []).filter((w) => w.requirements?.length).map((w) => w.adventure))];
  if (!adventures.length) return { skipped: "no adventure work" };

  const [{ data: att }, { data: denScouts }, { data: catalog }] = await Promise.all([
    db.from("den_meeting_attendance").select("scout_id").eq("meeting_id", meeting.id),
    db.from("scouts").select("id, first_name, family_id").eq("den_id", meeting.den_id).eq("is_active", true),
    db.from("adventures").select("name, home_idea, required").eq("rank", meeting.den.rank).in("name", adventures),
  ]);
  const present = new Set(((att ?? []) as { scout_id: string }[]).map((a) => a.scout_id));
  if (!present.size) return { skipped: "nobody marked here" };
  const scouts = (denScouts ?? []) as { id: string; first_name: string; family_id: string }[];
  // Present scouts include ones who have since left the den: look them up too.
  const missingIds = [...present].filter((id) => !scouts.some((s) => s.id === id));
  if (missingIds.length) {
    const { data } = await db.from("scouts").select("id, first_name, family_id").in("id", missingIds).eq("is_active", true);
    scouts.push(...((data ?? []) as typeof scouts));
  }

  // Claim the alerts not sent yet (a second save of the same meeting sends nothing new).
  const want = scouts.map((s) => ({ meeting_id: meeting.id, scout_id: s.id, kind: present.has(s.id) ? "worked" : "missed" }));
  if (!want.length) return { sent: 0 };
  const { data: claimed, error } = await db
    .from("meeting_family_alerts")
    .upsert(want, { onConflict: "meeting_id,scout_id,kind", ignoreDuplicates: true })
    .select("scout_id, kind");
  if (error) return { error: error.message };
  const todo = (claimed ?? []) as { scout_id: string; kind: "worked" | "missed" }[];
  if (!todo.length) return { sent: 0 };

  const adults = await familyAdults(db, [...new Set(scouts.map((s) => s.family_id))]);
  const to = (familyId: string) => (adults.get(familyId) ?? []).filter((id) => id !== exceptAdultId);
  const when = meetingWhen(meeting.meets_on, today);
  const group = RANK_GROUP[meeting.den.rank];
  // At-home ideas for electives only: a required adventure that was missed is caught up with the den.
  const ideas = new Map(
    ((catalog ?? []) as { name: string; home_idea: string | null; required: boolean }[]).map((a) => [a.name, a.required ? null : a.home_idea]),
  );
  const byId = new Map(scouts.map((s) => [s.id, s]));
  let pushed = 0;

  // There: one alert per family (siblings in the same den share it).
  const worked = new Map<string, string[]>();
  for (const t of todo.filter((t) => t.kind === "worked")) {
    const s = byId.get(t.scout_id);
    if (s) worked.set(s.family_id, [...(worked.get(s.family_id) ?? []), s.id]);
  }
  for (const [familyId, ids] of worked) {
    const res = await sendPushTo(to(familyId), {
      title: meeting.den.name,
      body: clip(`${when.cap} the ${group} worked on ${andList(adventures)}.`),
      url: `/scouts/${ids[0]}`,
      tag: `meeting-${meeting.id}`,
    });
    pushed += res.sent;
  }

  // Missed it: how to finish the (first) adventure at home.
  const withIdea = adventures.find((a) => ideas.get(a)) ?? adventures[0];
  const idea = ideas.get(withIdea);
  for (const t of todo.filter((t) => t.kind === "missed")) {
    const s = byId.get(t.scout_id);
    if (!s) continue;
    const res = await sendPushTo(to(s.family_id), {
      title: meeting.den.name,
      body: clip(
        `${s.first_name} missed ${when.low} den meeting: ${withIdea}. ${idea ? `Here's how to finish it at home: ${idea}` : "Ask your den leader how to catch up."}`,
      ),
      url: `/scouts/${s.id}`,
      tag: `meeting-${meeting.id}-${s.id}`,
    });
    pushed += res.sent;
  }
  return { sent: todo.length, pushed };
}

// ---------------------------------------------------------------------------
// 2. Reports approved or returned
// ---------------------------------------------------------------------------
export interface ReviewedReport {
  scout_id: string;
  adventure: string;
  requirement: string;
}

export async function alertReviewed(reports: ReviewedReport[], status: "approved" | "returned", note: string | null, exceptAdultId?: string) {
  const db = serverDb();
  if (!db || !reports.length) return { sent: 0 };
  const scoutIds = [...new Set(reports.map((r) => r.scout_id))];
  const { data } = await db.from("scouts").select("id, first_name, family_id").in("id", scoutIds).eq("is_active", true);
  const scouts = (data ?? []) as { id: string; first_name: string; family_id: string }[];
  const adults = await familyAdults(db, [...new Set(scouts.map((s) => s.family_id))]);
  let pushed = 0;
  for (const s of scouts) {
    const to = (adults.get(s.family_id) ?? []).filter((id) => id !== exceptAdultId);
    if (!to.length) continue;
    // "Bear Strong #1 and #2", per adventure.
    const byAdv = new Map<string, string[]>();
    for (const r of reports.filter((r) => r.scout_id === s.id)) byAdv.set(r.adventure, [...(byAdv.get(r.adventure) ?? []), r.requirement]);
    const what = andList(
      [...byAdv].map(([adv, reqs]) => `${adv} ${andList([...new Set(reqs)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((q) => `#${q}`))}`),
    );
    const res = await sendPushTo(to, {
      title: clip(`${what} ${status} for ${s.first_name}`, 90),
      body:
        status === "approved"
          ? "Nice work! The advancement chair will enter it in Scoutbook."
          : // The leader's note stays in the app, not on the lock screen.
            note
            ? "A leader sent it back with a note. Open the app to see it."
            : "A leader sent it back. See your scout's page.",
      url: `/scouts/${s.id}`,
      tag: `review-${s.id}`,
    });
    pushed += res.sent;
  }
  return { sent: scouts.length, pushed };
}

// ---------------------------------------------------------------------------
// 3. Newly earned in Scoutbook (weekly import)
// ---------------------------------------------------------------------------
export interface EarnedSnapshot {
  scoutByMember: Map<string, { id: string; first_name: string; family_id: string }>;
  before: Pick<EarnedRow, "scout_id" | "source_type" | "source_name" | "version">[];
  withRecords: Set<string>;
}

/** What the app has before the import: completed adventures and ranks, and who has any record. */
export async function earnedSnapshot(db: SupabaseClient): Promise<EarnedSnapshot> {
  const { data: scouts } = await db.from("scouts").select("id, first_name, family_id, bsa_member_id").eq("is_active", true).not("bsa_member_id", "is", null);
  const list = (scouts ?? []) as { id: string; first_name: string; family_id: string; bsa_member_id: string }[];
  const scoutByMember = new Map(list.map((s) => [s.bsa_member_id.trim(), { id: s.id, first_name: s.first_name, family_id: s.family_id }]));
  const before: EarnedSnapshot["before"] = [];
  const withRecords = new Set<string>();
  const ids = list.map((s) => s.id);
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from("scout_advancement")
        .select("scout_id, kind, source_type, source_name, version")
        .in("scout_id", chunk)
        .in("kind", ["adventure", "rank"])
        .order("id")
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as (EarnedSnapshot["before"][number] & { kind: string })[];
      for (const r of rows) {
        before.push(r);
        withRecords.add(r.scout_id);
      }
      if (rows.length < 1000) break;
    }
  }
  // A scout with only requirements on record has still been imported before.
  const unseen = ids.filter((id) => !withRecords.has(id));
  for (let i = 0; i < unseen.length; i += 200) {
    const { data } = await db.from("scout_advancement").select("scout_id").in("scout_id", unseen.slice(i, i + 200)).limit(1000);
    for (const r of (data ?? []) as { scout_id: string }[]) withRecords.add(r.scout_id);
  }
  return { scoutByMember, before, withRecords };
}

/** After a successful import: push each family their scouts' new adventures and ranks. */
export async function alertNewlyEarned(rows: ImportRow[], snap: EarnedSnapshot, server?: SupabaseClient) {
  const db = server ?? serverDb();
  if (!db) return { scouts: 0 };
  const incoming: EarnedRow[] = [];
  for (const r of rows) {
    const s = snap.scoutByMember.get(r.member_id.trim());
    if (!s) continue;
    incoming.push({
      scout_id: s.id,
      kind: r.kind,
      rank: r.rank,
      adventure: r.adventure,
      item: r.item,
      version: r.version ?? "",
      completed_on: r.completed_on,
      source_type: r.source_type,
      source_name: r.source_name,
    });
  }
  const earned = newlyEarned(incoming, snap.before, snap.withRecords, easternDate(Date.now()));
  if (!earned.size) return { scouts: 0 };
  const scouts = [...snap.scoutByMember.values()].filter((s) => earned.has(s.id));
  const adults = await familyAdults(db, [...new Set(scouts.map((s) => s.family_id))]);
  let pushed = 0;
  for (const s of scouts) {
    const msg = earnedMessage(s.first_name, earned.get(s.id)!);
    const res = await sendPushTo(adults.get(s.family_id) ?? [], { ...msg, url: `/scouts/${s.id}`, tag: `earned-${s.id}` });
    pushed += res.sent;
  }
  return { scouts: scouts.length, pushed };
}
