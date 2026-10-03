// Advancement helpers shared by the server pages and the Scoutbook import.
// Pure functions only (no Supabase calls), so they can be tested against a real export.
import type { DenRank } from "./types";

export const RANKS: DenRank[] = ["lion", "tiger", "wolf", "bear", "webelos", "aol"];

export const RANK_LABEL: Record<DenRank, string> = {
  lion: "Lion",
  tiger: "Tiger",
  wolf: "Wolf",
  bear: "Bear",
  webelos: "Webelos",
  aol: "Arrow of Light",
};

/** The current (2024) Cub Scout program. Older Scoutbook versions show in history only. */
export const CURRENT_VERSION = "2024";
export const ELECTIVES_NEEDED = 2;

export interface CatalogAdventure {
  rank: DenRank;
  name: string;
  required: boolean;
  req_count: number;
  special: boolean;
  sort_order: number;
  home?: "home" | "some" | "den" | null;
  home_idea?: string | null;
  info_url?: string | null;
}

export type RecordKind = "rank" | "adventure" | "requirement" | "award";

export interface AdvancementRecord {
  kind: RecordKind;
  rank: DenRank | null;
  adventure: string | null;
  item: string;
  version: string;
  completed_on: string | null;
  approved: boolean;
  awarded: boolean;
  awarded_on: string | null;
}

/** One Scoutbook line, ready for public.import_scout_advancement(). */
export interface ImportRow extends AdvancementRecord {
  member_id: string;
  name: string;
  source_type: string;
  source_name: string;
}

// ---------------------------------------------------------------------------
// Name matching
// ---------------------------------------------------------------------------
const RANK_WORDS: Record<string, DenRank> = {
  lion: "lion",
  tiger: "tiger",
  wolf: "wolf",
  bear: "bear",
  webelos: "webelos",
  aol: "aol",
  "arrow of light": "aol",
};

// Scoutbook short names that differ from the handbook name.
const ALIASES: Record<string, string> = { bb: "bb gun", "bb guns": "bb gun" };

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** "Race Time (Bear) Adventure" -> { base: "Race Time", rank: "bear" } */
export function splitAdventureLabel(label: string): { base: string; rank: DenRank | null } {
  let s = label.replace(/;/g, ",").replace(/[’‘]/g, "'").trim();
  s = s.replace(/\s+Adventure( Requirements)?$/i, "").trim();
  let rank: DenRank | null = null;
  const m = s.match(/^(.*?)\s*\(([^)]+)\)$/);
  if (m && RANK_WORDS[m[2].toLowerCase()]) {
    s = m[1].trim();
    rank = RANK_WORDS[m[2].toLowerCase()];
  }
  const alias = ALIASES[s.toLowerCase()];
  return { base: alias ?? s, rank };
}

export function rankFromLabel(label: string): DenRank | null {
  const s = label.replace(/\s+Rank( Requirements)?$/i, "").trim().toLowerCase();
  return RANK_WORDS[s] ?? null;
}

export class CatalogIndex {
  private byKey = new Map<string, CatalogAdventure[]>();
  constructor(catalog: CatalogAdventure[]) {
    for (const a of catalog) {
      const k = key(a.name);
      this.byKey.set(k, [...(this.byKey.get(k) ?? []), a]);
    }
  }
  /** Canonical name + rank for a Scoutbook adventure label. */
  resolve(label: string): { adventure: string; rank: DenRank | null } {
    const { base, rank } = splitAdventureLabel(label);
    const hits = this.byKey.get(key(base)) ?? [];
    const inRank = rank ? hits.filter((h) => h.rank === rank) : hits;
    if (inRank.length === 1) return { adventure: inRank[0].name, rank: inRank[0].rank };
    if (inRank.length > 1) return { adventure: inRank[0].name, rank };
    if (hits.length) return { adventure: hits[0].name, rank }; // e.g. old program, same name
    return { adventure: base, rank };
  }
}

// ---------------------------------------------------------------------------
// Scoutbook Plus "Quick Export -> Advancements" CSV
// ---------------------------------------------------------------------------
/** Minimal RFC 4180 CSV parser (quoted fields, doubled quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

const isoDate = (mdy: string): string | null => {
  const m = mdy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
};

export interface ParsedExport {
  rows: ImportRow[];
  skipped: number;
  scouts: number;
}

/** One Scoutbook advancement line, from the CSV export or read straight from Scoutbook. */
export interface ScoutbookLine {
  member_id: string;
  name: string;
  /** Scoutbook's "Advancement Type": Rank, Adventure, "Bear Strong Adventure Requirements"... */
  type: string;
  /** Scoutbook's "Advancement": "Wolf Rank", "Bear Strong Adventure", "2a"... */
  adv: string;
  version: string;
  completed_on: string | null;
  approved: boolean;
  awarded: boolean;
  awarded_on: string | null;
}

/** Lines to rows for import_scout_advancement(); repeats of the same record are dropped. */
export function rowsFromLines(lines: ScoutbookLine[], catalog: CatalogAdventure[]): { rows: ImportRow[]; skipped: number } {
  const index = new CatalogIndex(catalog);
  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const l of lines) {
    const type = l.type.trim();
    const name = l.adv.trim();
    if (!l.member_id || !type || !name) {
      skipped++;
      continue;
    }
    const dedupe = [l.member_id, type, name, l.version].join("|");
    if (seen.has(dedupe)) {
      skipped++;
      continue;
    }
    seen.add(dedupe);
    const base = {
      member_id: l.member_id,
      name: l.name,
      version: l.version,
      completed_on: l.completed_on,
      approved: l.approved,
      awarded: l.awarded,
      awarded_on: l.awarded_on,
      source_type: type,
      source_name: name,
    };
    if (type === "Adventure") {
      const { adventure, rank } = index.resolve(name);
      rows.push({ ...base, kind: "adventure", rank, adventure, item: adventure });
    } else if (type === "Rank") {
      rows.push({ ...base, kind: "rank", rank: rankFromLabel(name), adventure: null, item: name });
    } else if (/ Adventure Requirements$/i.test(type)) {
      const { adventure, rank } = index.resolve(type);
      rows.push({ ...base, kind: "requirement", rank, adventure, item: name });
    } else if (/ Rank Requirements$/i.test(type)) {
      rows.push({ ...base, kind: "requirement", rank: rankFromLabel(type), adventure: null, item: name });
    } else {
      rows.push({ ...base, kind: "award", rank: null, adventure: null, item: name });
    }
  }
  return { rows, skipped };
}

export function parseScoutbookExport(text: string, catalog: CatalogAdventure[]): ParsedExport {
  const table = parseCsv(text.replace(/^﻿/, ""));
  if (!table.length) throw new Error("The file is empty.");
  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => {
    const i = header.indexOf(name.toLowerCase());
    if (i < 0) throw new Error(`This doesn't look like a Scoutbook advancement export (no "${name}" column).`);
    return i;
  };
  const c = {
    id: col("BSA Member ID"),
    first: col("First Name"),
    last: col("Last Name"),
    type: col("Advancement Type"),
    adv: col("Advancement"),
    version: col("Version"),
    done: col("Date Completed"),
    approved: col("Approved"),
    awarded: col("Awarded"),
    awardedOn: header.indexOf("awarded date"),
  };
  const lines: ScoutbookLine[] = table.slice(1).map((r) => {
    const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    return {
      member_id: get(c.id),
      name: `${get(c.first)} ${get(c.last)}`.trim(),
      type: get(c.type),
      adv: get(c.adv),
      version: get(c.version),
      completed_on: isoDate(get(c.done)),
      approved: get(c.approved).toLowerCase() === "true",
      awarded: get(c.awarded).toLowerCase() === "true",
      awarded_on: isoDate(get(c.awardedOn)),
    };
  });
  const { rows, skipped } = rowsFromLines(lines, catalog);
  return { rows, skipped, scouts: new Set(rows.map((r) => r.member_id)).size };
}

// ---------------------------------------------------------------------------
// Rank progress
// ---------------------------------------------------------------------------
export interface AdventureProgress {
  name: string;
  required: boolean;
  special: boolean;
  home: "home" | "some" | "den" | null;
  idea: string | null;
  url: string | null;
  reqCount: number;
  reqsDone: number;
  done: boolean;
  approved: boolean;
  completedOn: string | null;
}

export interface RankProgress {
  rank: DenRank;
  earned: AdvancementRecord | null;
  required: AdventureProgress[];
  electives: AdventureProgress[]; // started or finished electives
  requiredDone: number;
  electivesDone: number;
  percent: number;
}

/** Distinct top-level requirement numbers ("2a", "2b" -> 2). */
function reqNumbers(items: string[]): number {
  return new Set(items.map((i) => i.match(/^\d+/)?.[0] ?? i)).size;
}

export function rankProgress(
  rank: DenRank,
  records: AdvancementRecord[],
  catalog: CatalogAdventure[],
): RankProgress {
  const current = records.filter((r) => r.version === CURRENT_VERSION);
  const forRank = (r: AdvancementRecord) => r.rank === rank || r.rank === null;
  const list = catalog.filter((a) => a.rank === rank).sort((a, b) => a.sort_order - b.sort_order);

  const progress = list.map<AdventureProgress>((a) => {
    const adv = current.find((r) => r.kind === "adventure" && r.adventure === a.name && forRank(r));
    const reqs = current
      .filter((r) => r.kind === "requirement" && r.adventure === a.name && forRank(r))
      .map((r) => r.item);
    return {
      name: a.name,
      required: a.required,
      special: a.special,
      home: a.home ?? null,
      idea: a.home_idea ?? null,
      url: a.info_url ?? null,
      reqCount: a.req_count,
      reqsDone: adv ? a.req_count : Math.min(reqNumbers(reqs), a.req_count),
      done: !!adv,
      approved: adv?.approved ?? false,
      completedOn: adv?.completed_on ?? null,
    };
  });

  const required = progress.filter((p) => p.required);
  const electives = progress.filter((p) => !p.required && (p.done || p.reqsDone > 0));
  const requiredDone = required.filter((p) => p.done).length;
  const electivesDone = Math.min(electives.filter((p) => p.done).length, ELECTIVES_NEEDED);
  const earned = records.find((r) => r.kind === "rank" && r.rank === rank && r.version === CURRENT_VERSION) ?? null;
  const total = required.length + ELECTIVES_NEEDED;
  const percent = earned ? 100 : Math.round(((requiredDone + electivesDone) / total) * 100);
  return { rank, earned, required, electives, requiredDone, electivesDone, percent };
}

/** Ranks earned, oldest first (any program version). */
export function earnedRanks(records: AdvancementRecord[]): AdvancementRecord[] {
  return records
    .filter((r) => r.kind === "rank")
    .sort((a, b) => (a.completed_on ?? "").localeCompare(b.completed_on ?? ""));
}

export function fmtShortDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Up to `n` unfinished adventures a family can work on at home: required first, then started electives, then others. */
export function homeSuggestions(p: RankProgress, catalog: CatalogAdventure[], n = 3): AdventureProgress[] {
  const started = new Set(p.electives.map((e) => e.name));
  const otherElectives: AdventureProgress[] = catalog
    .filter((a) => a.rank === p.rank && !a.required && !started.has(a.name) && a.home === "home")
    .map((a) => ({
      name: a.name,
      required: false,
      special: a.special,
      home: a.home ?? null,
      idea: a.home_idea ?? null,
      url: a.info_url ?? null,
      reqCount: a.req_count,
      reqsDone: 0,
      done: false,
      approved: false,
      completedOn: null,
    }));
  const needElectives = p.electivesDone < ELECTIVES_NEEDED;
  const pool = [
    ...p.required.filter((a) => !a.done && a.home === "home"),
    ...(needElectives ? p.electives.filter((a) => !a.done && a.home !== "den") : []),
    ...(needElectives ? otherElectives : []),
  ];
  return pool.filter((a) => a.idea).slice(0, n);
}

/** Label for an award item on shopping lists and the awards night sheet. */
export function awardLabel(r: { kind: RecordKind; adventure: string | null; item: string; rank: DenRank | null }): string {
  if (r.kind === "adventure") return `${r.adventure ?? r.item}${r.rank ? ` (${RANK_LABEL[r.rank]})` : ""}`;
  if (r.kind === "rank") return r.item.replace(/ Rank$/, "") + " rank patch";
  return r.item;
}
