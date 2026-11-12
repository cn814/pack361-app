import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RANK_LABEL, homeSuggestions, rankProgress, type AdventureProgress, type AdvancementRecord, type CatalogAdventure } from "./advancement";
import { clip, shortDay } from "./reminder-logic";
import type { DenRank } from "./types";

// "Your scout this week" in the Sunday newsletter: per scout, how far along the rank is, the
// adventure closest to done (with its try-at-home idea), reports a leader approved or returned
// in the last week, and what the next den meeting plans. Secret-key client: every query is
// limited to the family's own scouts by hand.

export interface ScoutWeek {
  id: string;
  first_name: string;
  rank: string | null;
  percent: number | null;
  earned: boolean;
  closest: { name: string; reqsDone: number; reqCount: number; idea: string | null } | null;
  approved: string[];
  returned: { what: string; note: string | null }[];
  nextMeeting: { day: string; plan: string } | null;
}

const RECORD_COLS = "scout_id, kind, rank, adventure, item, version, completed_on, approved, awarded, awarded_on";
const DAY = 86400000;

// The adventure catalog, read once per run (the Sunday job builds every family's email with one client).
const catalogs = new WeakMap<SupabaseClient, Promise<CatalogAdventure[]>>();
function catalogFor(db: SupabaseClient): Promise<CatalogAdventure[]> {
  let c = catalogs.get(db);
  if (!c) {
    c = Promise.resolve(
      db.from("adventures").select("rank, name, required, req_count, special, sort_order, home, home_idea, info_url").order("sort_order"),
    ).then((r) => (r.data ?? []) as CatalogAdventure[]);
    catalogs.set(db, c);
  }
  return c;
}

/** The unfinished adventure with the most done (required first on a tie), or a home idea to start. */
export function closestToDone(required: AdventureProgress[], electives: AdventureProgress[], fallback: AdventureProgress | undefined) {
  const started = [...required, ...electives].filter((a) => !a.done && a.reqsDone > 0 && a.reqCount > 0);
  started.sort((a, b) => b.reqsDone / b.reqCount - a.reqsDone / a.reqCount || Number(b.required) - Number(a.required));
  const pick = started[0] ?? fallback;
  return pick ? { name: pick.name, reqsDone: pick.reqsDone, reqCount: pick.reqCount, idea: pick.idea && !pick.required ? clip(pick.idea, 200) : null } : null;
}

const reqLabel = (adventure: string, reqs: string[]) =>
  `${adventure} ${[...new Set(reqs)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((r) => `#${r}`).join(", ")}`;

export async function loadScoutWeek(
  db: SupabaseClient,
  scouts: { id: string; first_name: string; den_id: string | null; rank: DenRank | null }[],
  today: string,
  now = Date.now(),
): Promise<ScoutWeek[]> {
  if (!scouts.length) return [];
  const ids = scouts.map((s) => s.id);
  const dens = [...new Set(scouts.map((s) => s.den_id).filter((d): d is string => Boolean(d)))];
  const since = new Date(now - 7 * DAY).toISOString();
  const [catalog, records, reports, meetings] = await Promise.all([
    catalogFor(db),
    db
      .from("scout_advancement")
      .select(RECORD_COLS)
      .in("scout_id", ids)
      .order("id")
      .range(0, 2999)
      .then((x) => (x.data ?? []) as (AdvancementRecord & { scout_id: string })[]),
    // A report approved during the week is usually marked "recorded" by the Sunday-night
    // Scoutbook import before this email goes out, so "recorded" counts as approved here.
    db
      .from("advancement_submissions")
      .select("scout_id, adventure, requirement, status, review_note, reviewed_at")
      .in("scout_id", ids)
      .in("status", ["approved", "returned", "recorded"])
      .is("meeting_id", null)
      .gte("reviewed_at", since)
      .order("reviewed_at")
      .then((x) => (x.data ?? []) as { scout_id: string; adventure: string; requirement: string; status: string; review_note: string | null }[]),
    dens.length
      ? db
          .from("den_meetings")
          .select("den_id, meets_on, title, adventure, work")
          .in("den_id", dens)
          .gte("meets_on", today)
          .order("meets_on")
          .limit(dens.length * 4)
          .then((x) => (x.data ?? []) as { den_id: string; meets_on: string; title: string; adventure: string | null; work: { adventure: string }[] | null }[])
      : Promise.resolve([]),
  ]);

  return scouts.map((s) => {
    let percent: number | null = null;
    let earned = false;
    let closest: ScoutWeek["closest"] = null;
    if (s.rank) {
      const p = rankProgress(s.rank, records.filter((r) => r.scout_id === s.id), catalog);
      percent = p.percent;
      earned = Boolean(p.earned);
      if (!earned) closest = closestToDone(p.required, p.electives, homeSuggestions(p, catalog, 1)[0]);
    }
    const mine = reports.filter((r) => r.scout_id === s.id);
    const group = (list: typeof mine) => {
      const by = new Map<string, typeof mine>();
      for (const r of list) by.set(r.adventure, [...(by.get(r.adventure) ?? []), r]);
      return [...by.entries()];
    };
    const approved = group(mine.filter((r) => r.status !== "returned")).map(([adv, rs]) => reqLabel(adv, rs.map((r) => r.requirement)));
    const returned = group(mine.filter((r) => r.status === "returned")).map(([adv, rs]) => ({
      what: reqLabel(adv, rs.map((r) => r.requirement)),
      note: rs.map((r) => r.review_note).find(Boolean) ?? null,
    }));
    const m = s.den_id ? meetings.find((x) => x.den_id === s.den_id) : undefined;
    const advs = m ? (m.work ?? []).map((w) => w.adventure).filter(Boolean) : [];
    const plan = m ? (advs.length ? advs.join(", ") : m.adventure || m.title) : "";
    return {
      id: s.id,
      first_name: s.first_name,
      rank: s.rank ? RANK_LABEL[s.rank] : null,
      percent,
      earned,
      closest,
      approved,
      returned,
      nextMeeting: m ? { day: shortDay(m.meets_on), plan } : null,
    };
  });
}
