import "server-only";
import { createClient } from "./supabase/server";
import type { ImportRow } from "./advancement";

// Compares advancement rows read from Scoutbook with what the app has for the same scouts,
// the same way import_scout_advancement() counts changes, without saving anything. Grouped by
// kind and version, with a few example labels (adventure / rank names, never scout names), so a
// labelling mismatch with the CSV export shows up before anything is replaced.

export interface CompareGroup {
  kind: string;
  version: string;
  same: number;
  new: number;
  changed: number;
  removed: number;
  newExamples: string[];
  removedExamples: string[];
}

export interface CompareResult {
  scoutsMatched: number;
  notOnRoster: number;
  same: number;
  new: number;
  changed: number;
  removed: number;
  groups: CompareGroup[];
}

interface Existing {
  scout_id: string;
  kind: string;
  rank: string | null;
  adventure: string | null;
  item: string;
  version: string;
  completed_on: string | null;
  approved: boolean;
  awarded: boolean;
  awarded_on: string | null;
  source_type: string;
  source_name: string;
}

const COLS = "scout_id, kind, rank, adventure, item, version, completed_on, approved, awarded, awarded_on, source_type, source_name";
const label = (r: { source_type: string; source_name: string }) =>
  /requirements$/i.test(r.source_type) ? `${r.source_type} ${r.source_name}` : r.source_name;

export async function compareAdvancement(rows: ImportRow[]): Promise<CompareResult> {
  const supabase = await createClient();
  const { data: scouts } = await supabase.from("scouts").select("id, bsa_member_id").not("bsa_member_id", "is", null);
  const byMember = new Map(((scouts ?? []) as { id: string; bsa_member_id: string }[]).map((s) => [s.bsa_member_id.trim(), s.id]));

  const incoming = new Map<string, ImportRow & { scout_id: string }>();
  const members = new Set<string>();
  for (const r of rows) {
    members.add(r.member_id);
    const scout = byMember.get(r.member_id);
    if (!scout) continue;
    const k = [scout, r.source_type, r.source_name, r.version ?? ""].join("|");
    if (!incoming.has(k)) incoming.set(k, { ...r, scout_id: scout });
  }
  const scoutIds = [...new Set([...incoming.values()].map((r) => r.scout_id))];

  const existing = new Map<string, Existing>();
  for (let i = 0; i < scoutIds.length; i += 40) {
    const ids = scoutIds.slice(i, i + 40);
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from("scout_advancement").select(COLS).in("scout_id", ids).order("id").range(from, from + 999);
      const list = (data ?? []) as Existing[];
      for (const e of list) existing.set([e.scout_id, e.source_type, e.source_name, e.version].join("|"), e);
      if (list.length < 1000) break;
    }
  }

  const groups = new Map<string, CompareGroup>();
  const group = (kind: string, version: string) => {
    const k = `${kind}|${version}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { kind, version, same: 0, new: 0, changed: 0, removed: 0, newExamples: [], removedExamples: [] }));
    return g;
  };
  const note = (list: string[], s: string) => {
    if (list.length < 6 && !list.includes(s)) list.push(s);
  };
  const totals = { same: 0, new: 0, changed: 0, removed: 0 };
  for (const [k, r] of incoming) {
    const g = group(r.kind, r.version ?? "");
    const e = existing.get(k);
    if (!e) {
      g.new++;
      totals.new++;
      note(g.newExamples, label(r));
    } else if (
      e.kind !== r.kind ||
      (e.rank ?? null) !== (r.rank ?? null) ||
      (e.adventure ?? null) !== (r.adventure ?? null) ||
      e.item !== r.item ||
      (e.completed_on ?? null) !== (r.completed_on ?? null) ||
      e.approved !== r.approved ||
      e.awarded !== r.awarded ||
      (e.awarded_on ?? null) !== (r.awarded_on ?? null)
    ) {
      g.changed++;
      totals.changed++;
    } else {
      g.same++;
      totals.same++;
    }
  }
  for (const [k, e] of existing) {
    if (incoming.has(k)) continue;
    const g = group(e.kind, e.version);
    g.removed++;
    totals.removed++;
    note(g.removedExamples, label(e));
  }
  return {
    scoutsMatched: scoutIds.length,
    notOnRoster: [...members].filter((m) => !byMember.has(m)).length,
    ...totals,
    groups: [...groups.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.version.localeCompare(b.version)),
  };
}
