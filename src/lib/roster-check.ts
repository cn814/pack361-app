// Roster check: compare a Scoutbook Plus (or my.scouting) roster export with the app's roster.
// Runs in the browser: the file never leaves the admin's computer, and only the changes the admin
// picks are sent to the server. Pure functions, no Supabase calls.

import { cellMemberId, type Cell } from "./training-import";
import { isGrade, RANK_FOR_GRADE } from "./join";
import type { DenRank } from "./types";

// ---------------------------------------------------------------------------
// Reading the export
// ---------------------------------------------------------------------------
type Col = "memberId" | "first" | "last" | "nickname" | "name" | "den" | "grade" | "type" | "position" | "parentFirst" | "parentLast" | "parentEmail";

const HEADERS: Record<Col, string[]> = {
  memberId: ["memberid", "bsaid", "bsamemberid", "membernumber", "memberno", "bsamembernumber", "bsanumber", "bsamemberno", "memberidnumber", "youthmemberid"],
  first: ["firstname", "first", "givenname", "fname", "youthfirstname", "scoutfirstname"],
  last: ["lastname", "last", "surname", "lname", "familyname", "youthlastname", "scoutlastname"],
  nickname: ["nickname", "preferredname", "nick"],
  name: ["name", "fullname", "membername", "youthname", "scoutname", "youth", "scout"],
  den: ["den", "denname", "patrol", "patrolname", "denpatrol", "denorpatrol", "subunit", "subunitname", "denassignment", "dennumber"],
  grade: ["grade", "schoolgrade", "currentgrade", "gradelevel"],
  type: ["membertype", "type", "youthadult", "youthoradult", "memberclass", "category"],
  position: ["position", "positions", "positionname", "positiontitle", "registeredposition", "primaryposition"],
  parentFirst: ["parentfirstname", "parent1firstname", "parentguardianfirstname", "guardianfirstname", "parent1first"],
  parentLast: ["parentlastname", "parent1lastname", "parentguardianlastname", "guardianlastname", "parent1last"],
  parentEmail: ["parentemail", "parent1email", "parentguardianemail", "guardianemail", "parentemailaddress", "parent1emailaddress", "email", "emailaddress", "primaryemail"],
};

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

function cellText(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return "";
  return String(v).trim();
}

function headerCol(h: string): Col | null {
  const n = norm(h);
  if (!n) return null;
  for (const [col, names] of Object.entries(HEADERS) as [Col, string[]][]) if (names.includes(n)) return col;
  if (/memberid|bsaid/.test(n)) return "memberId";
  return null;
}

export interface ExportRow {
  /** Spreadsheet row number, for messages. */
  line: number;
  memberId: string | null;
  first: string;
  last: string;
  nickname: string;
  denText: string;
  rank: DenRank | null;
  denNumber: number | null;
  parentFirst: string;
  parentLast: string;
  parentEmail: string;
  /** The report gives only the last initial ("John B" in Unit Roster Lite). */
  initialOnly: boolean;
}

export interface ParsedRoster {
  rows: ExportRow[];
  /** Adults and den chiefs left out. */
  skipped: number;
  columns: string[];
  error?: string;
}

const RANK_WORDS: [RegExp, DenRank][] = [
  [/\blions?\b/, "lion"],
  [/\btigers?\b/, "tiger"],
  [/\bwol(f|ves)\b/, "wolf"],
  [/\bbears?\b/, "bear"],
  [/\bwebelos?\b|\bweblos\b/, "webelos"],
  [/\barrow of light\b|\baol\b|\barrows?\b/, "aol"],
];

/** "Bear Den 5", "Den 5 - Bears", "AOL 3", "Arrow of Light Den 8" → rank and number. */
export function parseDen(text: string): { rank: DenRank | null; number: number | null } {
  const t = text.toLowerCase();
  let rank: DenRank | null = null;
  for (const [re, r] of RANK_WORDS) {
    if (re.test(t)) {
      rank = r;
      break;
    }
  }
  const n = t.match(/\d+/);
  return { rank, number: n ? Number(n[0]) : null };
}

/** Kindergarten, "K", "1st", "Grade 2", 3 → K..5, or null. */
function gradeOf(text: string): DenRank | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  if (/^k|kinder/.test(t)) return RANK_FOR_GRADE.K;
  const n = t.match(/\d+/)?.[0];
  return n && isGrade(n) ? RANK_FOR_GRADE[n] : null;
}

const ADULT_POSITION = /leader|cubmaster|committee|chair|treasurer|secretary|adult|parent|guardian|chartered|representative|coordinator|advisor|den chief/i;

function splitName(full: string): { first: string; last: string } {
  const s = full.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  if (s.includes(",")) {
    const [last, rest] = s.split(",", 2);
    return { first: (rest ?? "").trim().split(/\s+/)[0] ?? "", last: last.trim() };
  }
  const parts = s.split(/\s+/).filter((p) => !/^(jr|sr|ii|iii|iv)\.?$/i.test(p));
  if (parts.length < 2) return { first: parts[0] ?? "", last: "" };
  return { first: parts[0], last: parts[parts.length - 1] };
}

/** Read a roster table (from the CSV parser or the Excel reader). Youth only. */
export function parseRosterExport(table: Cell[][]): ParsedRoster {
  let header = -1;
  let cols: Partial<Record<Col, number>> = {};
  let best = 0;
  for (let i = 0; i < Math.min(table.length, 25); i++) {
    const c: Partial<Record<Col, number>> = {};
    (table[i] ?? []).forEach((cell, j) => {
      const col = headerCol(cellText(cell));
      if (col && c[col] === undefined) c[col] = j;
    });
    const person = c.memberId !== undefined || c.name !== undefined || (c.first !== undefined && c.last !== undefined);
    const score = Object.keys(c).length;
    if (person && (c.den !== undefined || c.grade !== undefined) && score > best) {
      header = i;
      cols = c;
      best = score;
    }
  }
  if (header < 0) {
    return {
      rows: [],
      skipped: 0,
      columns: [],
      error: "Couldn't find the column headings. The roster needs the scouts' names (or member IDs) and a Den column.",
    };
  }
  const head = table[header] ?? [];
  const columns = [...new Set(Object.values(cols))].sort((a, b) => a - b).map((i) => cellText(head[i]));
  const get = (row: Cell[], c: Col) => (cols[c] === undefined ? "" : cellText(row[cols[c]!]));

  const rows: ExportRow[] = [];
  let skipped = 0;
  for (let r = header + 1; r < table.length; r++) {
    const row = table[r] ?? [];
    // Reports like Unit Roster Lite list the leaders after the youth, with other columns.
    const cells = row.map(cellText).filter(Boolean);
    if (cells.length === 1 && /^(leader|adult)s?( members?)?:?$/i.test(cells[0])) break;
    let first = get(row, "first");
    let last = get(row, "last");
    if ((!first || !last) && cols.name !== undefined) ({ first, last } = splitName(get(row, "name")));
    const memberId = cellMemberId(cols.memberId === undefined ? null : row[cols.memberId]);
    if (!memberId && !(first && last)) continue; // blank, a total line, or a sub-heading
    const type = get(row, "type").toLowerCase();
    const position = get(row, "position");
    if ((type && /adult|leader|parent/.test(type) && !/youth/.test(type)) || (position && ADULT_POSITION.test(position))) {
      skipped++;
      continue;
    }
    const denText = get(row, "den");
    const den = parseDen(denText);
    const rank = den.rank ?? gradeOf(get(row, "grade"));
    if (!rank && !denText && cols.type === undefined && cols.grade === undefined) {
      // No den and no way to tell it's a scout: probably an adult in a mixed export.
      skipped++;
      continue;
    }
    const email = get(row, "parentEmail").toLowerCase();
    rows.push({
      line: r + 1,
      memberId,
      first,
      last,
      nickname: get(row, "nickname"),
      denText,
      rank,
      denNumber: den.rank ? den.number : null,
      parentFirst: get(row, "parentFirst"),
      parentLast: get(row, "parentLast"),
      parentEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
      initialOnly: /^[a-z]\.?$/i.test(last),
    });
  }
  return { rows, skipped, columns };
}

// ---------------------------------------------------------------------------
// Comparing with the app
// ---------------------------------------------------------------------------
export interface AppScout {
  id: string;
  family_id: string;
  family_name: string;
  first_name: string;
  last_name: string;
  bsa_member_id: string | null;
  den_id: string | null;
  is_active: boolean;
}

export interface AppDen {
  id: string;
  rank: DenRank;
  number: number;
  name: string;
  is_active: boolean;
}

export interface AppFamily {
  id: string;
  family_name: string;
  is_active: boolean;
  /** Parent and leader emails in the family. */
  emails: string[];
}

export interface NewScout {
  row: ExportRow;
  den: AppDen | null;
  /** The family this scout most likely belongs to, and why. */
  family: AppFamily | null;
  familyWhy: string;
}

export interface RosterDiff {
  /** In Scoutbook, not in the app. */
  newScouts: NewScout[];
  /** In the app but in a different den in Scoutbook. */
  moves: { scout: AppScout; from: AppDen | null; to: AppDen; row: ExportRow }[];
  /** Matched by name; Scoutbook has a member ID the app doesn't. */
  memberIds: { scout: AppScout; memberId: string }[];
  /** Turned off in the app but registered in Scoutbook. */
  inactive: { scout: AppScout; row: ExportRow }[];
  /** Active in the app, not in this export. */
  missing: AppScout[];
  /** Rows whose den isn't one of the app's dens. */
  unknownDens: { row: ExportRow; scout: AppScout | null }[];
  /** Names that differ between the two, for a look. */
  nameDiffs: { scout: AppScout; row: ExportRow }[];
  /** Rows that match more than one scout in the app. */
  ambiguous: ExportRow[];
  matched: number;
}

const key = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const idKey = (s: string | null) => (s ? s.trim().replace(/^0+(?=\d)/, "") : "");
const firstKey = (s: string) => key(s.trim().split(/\s+/)[0] ?? "");

/** The app den for an export row: same rank and number, or the only active den of that rank. */
export function matchDen(row: Pick<ExportRow, "rank" | "denNumber">, dens: AppDen[]): AppDen | null {
  if (!row.rank) return null;
  const same = dens.filter((d) => d.rank === row.rank);
  if (row.denNumber != null) return same.find((d) => d.number === row.denNumber) ?? null;
  const active = same.filter((d) => d.is_active);
  return active.length === 1 ? active[0] : null;
}

export function diffRoster(rows: ExportRow[], scouts: AppScout[], dens: AppDen[], families: AppFamily[]): RosterDiff {
  const byId = new Map<string, AppScout[]>();
  const byName = new Map<string, AppScout[]>();
  // Roster Lite exports carry only a last initial: those rows match on first name + initial.
  const byInitial = new Map<string, AppScout[]>();
  for (const s of scouts) {
    if (s.bsa_member_id) byId.set(idKey(s.bsa_member_id), [...(byId.get(idKey(s.bsa_member_id)) ?? []), s]);
    const n = firstKey(s.first_name) + "|" + key(s.last_name);
    byName.set(n, [...(byName.get(n) ?? []), s]);
    const i = firstKey(s.first_name) + "|" + key(s.last_name).slice(0, 1);
    byInitial.set(i, [...(byInitial.get(i) ?? []), s]);
  }
  const denById = new Map(dens.map((d) => [d.id, d]));
  const diff: RosterDiff = { newScouts: [], moves: [], memberIds: [], inactive: [], missing: [], unknownDens: [], nameDiffs: [], ambiguous: [], matched: 0 };
  const seen = new Set<string>();

  for (const row of rows) {
    let scout: AppScout | undefined;
    const idHits = row.memberId ? byId.get(idKey(row.memberId)) ?? [] : [];
    if (idHits.length > 1) {
      diff.ambiguous.push(row);
      continue;
    }
    if (idHits.length === 1) scout = idHits[0];
    else {
      const lastKey = row.initialOnly ? key(row.last).slice(0, 1) : key(row.last);
      const index = row.initialOnly ? byInitial : byName;
      const names = [row.first, row.nickname].filter(Boolean).map((f) => firstKey(f) + "|" + lastKey);
      const hits = lastKey ? [...new Set(names.flatMap((n) => index.get(n) ?? []))] : [];
      // A name match whose app member ID differs is a different child. With only an initial,
      // two scouts sharing a first name and initial is ambiguous (only a single hit is accepted).
      const usable = hits.filter((s) => !s.bsa_member_id || !row.memberId || idKey(s.bsa_member_id) === idKey(row.memberId));
      if (usable.length > 1) {
        diff.ambiguous.push(row);
        continue;
      }
      scout = usable[0];
      if (scout && row.memberId && !scout.bsa_member_id) diff.memberIds.push({ scout, memberId: row.memberId });
    }

    const den = matchDen(row, dens);
    if (!scout) {
      if (!den && (row.denText || row.rank)) diff.unknownDens.push({ row, scout: null });
      diff.newScouts.push({ row, den, ...guessFamily(row, families) });
      continue;
    }
    seen.add(scout.id);
    diff.matched++;
    if (!scout.is_active) diff.inactive.push({ scout, row });
    const firstOk = [row.first, row.nickname].some((f) => f && firstKey(f) === firstKey(scout.first_name));
    const lastOk = row.initialOnly ? key(row.last)[0] === key(scout.last_name)[0] : key(row.last) === key(scout.last_name);
    if (!firstOk || !lastOk) diff.nameDiffs.push({ scout, row });
    if (!den) {
      if (row.denText || row.rank) diff.unknownDens.push({ row, scout });
    } else if (den.id !== scout.den_id) {
      diff.moves.push({ scout, from: scout.den_id ? denById.get(scout.den_id) ?? null : null, to: den, row });
    }
  }
  diff.missing = scouts.filter((s) => s.is_active && !seen.has(s.id));
  return diff;
}

function guessFamily(row: ExportRow, families: AppFamily[]): { family: AppFamily | null; familyWhy: string } {
  if (row.parentEmail) {
    const f = families.find((x) => x.emails.includes(row.parentEmail));
    if (f) return { family: f, familyWhy: `${row.parentEmail} is in this family` };
  }
  const same = families.filter((f) => f.is_active && key(f.family_name) === key(row.last));
  if (same.length === 1) return { family: same[0], familyWhy: "same last name: check it's the same family" };
  return { family: null, familyWhy: "" };
}
