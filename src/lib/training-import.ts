// Reading a training report exported from my.scouting.org (CSV or Excel) and matching it to
// the roster. Runs in the browser: the file never leaves the leader's device, and only adult
// IDs, course keys, dates and member IDs are sent to the server.
// Pure functions, no Supabase calls.

import { parseCsv } from "./advancement";
import { COURSE_BY_KEY, MEMBER_ID, defaultExpiry, type CourseKey, type TrainingRow } from "./training";

export type Cell = string | number | boolean | Date | null | undefined;

/** Most rows one import applies. */
export const IMPORT_MAX = 2000;

// ---------------------------------------------------------------------------
// Course names -> keys
// ---------------------------------------------------------------------------
const COURSE_WORDS: [RegExp, CourseKey][] = [
  [/safeguarding youth|youth protection|\bypt\b|\by01\b|\bsyt\b/, "ypt"],
  [/hazardous weather|\bsco_?800\b/, "hazardous_weather"],
  [/chartered? org\w*|\bd72\b/, "cor"],
  [/\bbaloo\b|basic adult leader outdoor/, "baloo"],
  [/safe swim/, "safe_swim"],
  [/safety afloat/, "safety_afloat"],
  [/introduction to outdoor leader|\biols\b/, "iols"],
  [/wood badge/, "wood_badge"],
  [/climb on safely/, "climb_on_safely"],
  [/trek safely/, "trek_safely"],
  [/\bcpr\b|first aid/, "cpr_first_aid"],
  [
    /position[ -]specific|den leader (position|specific|training)|cubmaster (position|specific|training)|cubmaster and assistant|pack committee|committee challenge|\bc4[02]\b|\bc60\b/,
    "position",
  ],
];

/** The course a report's course name or code refers to, or null if the app doesn't track it. */
export function courseFromText(text: string): CourseKey | null {
  const t = text.toLowerCase().replace(/\s+/g, " ");
  for (const [re, key] of COURSE_WORDS) if (re.test(t)) return key;
  return null;
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number): string | null {
  if (y < 1950 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** A report cell as YYYY-MM-DD, or null. Handles Excel dates and serial numbers, M/D/YYYY and ISO text. */
export function cellDate(v: Cell): string | null {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    // Excel dates are read as midnight UTC.
    return validDate(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  }
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return null; // Excel serial day numbers (1954 to 2119)
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    return validDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})\b/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return validDate(y, +m[1], +m[2]);
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) return cellDate(Number(s));
  if (/[a-z]{3}/i.test(s)) {
    const t = Date.parse(s);
    if (!isNaN(t)) {
      const dt = new Date(t);
      return validDate(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
    }
  }
  return null;
}

function cellText(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return cellDate(v) ?? "";
  return String(v).trim();
}

/** Digits-only member ID from a cell (Excel may give a number), or null. */
export function cellMemberId(v: Cell): string | null {
  const s = cellText(v).replace(/\.0+$/, "").replace(/[\s-]/g, "");
  return MEMBER_ID.test(s) ? s.replace(/^0+(?=\d)/, "") : null;
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------
type Col = "memberId" | "first" | "last" | "name" | "course" | "completed" | "expires" | "position";

const HEADERS: Record<Col, string[]> = {
  memberId: ["memberid", "bsaid", "bsamemberid", "membernumber", "memberno", "bsamembernumber", "bsanumber", "bsamemberno", "memberidnumber"],
  first: ["firstname", "first", "givenname", "fname"],
  last: ["lastname", "last", "surname", "lname", "familyname"],
  name: ["name", "fullname", "membername", "leadername", "adultname", "participantname", "personname"],
  course: ["course", "training", "trainingcode", "coursename", "trainingname", "coursetitle", "trainingtitle", "trainingcourse", "coursecode", "trainingtype"],
  completed: ["completed", "completiondate", "datecompleted", "trainingdate", "completeddate", "datetaken", "dateofcompletion", "coursedate", "completedon", "takenon", "yptcompletiondate", "yptdate", "ypttrainingdate"],
  expires: ["expires", "expiration", "expirationdate", "expiresdate", "expirydate", "yptexpirationdate", "yptexpires", "expireson", "yptexpiration"],
  position: ["position", "positionname", "positiontitle", "registeredposition", "positions", "primaryposition"],
};

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

function headerCol(h: string): Col | null {
  const n = norm(h);
  if (!n) return null;
  for (const [col, names] of Object.entries(HEADERS) as [Col, string[]][]) if (names.includes(n)) return col;
  if (/memberid|bsaid/.test(n)) return "memberId";
  if (/expir/.test(n)) return "expires";
  if (/(complet|taken)/.test(n) && /(date|on$)/.test(n)) return "completed";
  return null;
}

interface Layout {
  header: number;
  cols: Partial<Record<Col, number>>;
  courseCols: number[];
  /** One column per course, each cell a date ("wide" reports). */
  wide: { index: number; course: CourseKey; kind: "completed" | "expires"; header: string }[];
}

function layoutOf(row: Cell[], index: number): Layout {
  const cols: Partial<Record<Col, number>> = {};
  const courseCols: number[] = [];
  row.forEach((c, i) => {
    const col = headerCol(cellText(c));
    if (!col) return;
    if (col === "course") courseCols.push(i);
    if (cols[col] === undefined) cols[col] = i;
  });
  const wide: Layout["wide"] = [];
  if (!courseCols.length) {
    // Headings that name a course ("YPT Expiration Date", "SCO_800 Hazardous Weather"): a column
    // of dates for that course.
    row.forEach((c, i) => {
      const h = cellText(c);
      const col = headerCol(h);
      if (col && col !== "completed" && col !== "expires") return;
      const course = courseFromText(h);
      if (course) wide.push({ index: i, course, kind: /expir|current|valid|through|due/i.test(h) ? "expires" : "completed", header: h });
    });
    for (const w of wide) {
      if (cols.completed === w.index) delete cols.completed;
      if (cols.expires === w.index) delete cols.expires;
    }
  }
  return { header: index, cols, courseCols, wide };
}

const hasPerson = (l: Layout) => l.cols.memberId !== undefined || l.cols.name !== undefined || (l.cols.first !== undefined && l.cols.last !== undefined);
const hasDates = (l: Layout) => l.cols.completed !== undefined || l.cols.expires !== undefined || l.wide.length > 0;

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------
export interface ReportRow {
  /** Spreadsheet row number, for messages. */
  line: number;
  memberId: string | null;
  first: string;
  last: string;
  courseText: string;
  course: CourseKey | null;
  completed: string | null;
  expires: string | null;
}

export interface ParsedReport {
  rows: ReportRow[];
  /** Header names found, for the "we read these columns" note. */
  columns: string[];
  /** No course column: a Safeguarding Youth (YPT Aging) report. */
  yptOnly: boolean;
  error?: string;
}

const SUFFIX = /^(jr|sr|ii|iii|iv|v)\.?$/i;

function splitName(full: string): { first: string; last: string } {
  const s = full.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  if (s.includes(",")) {
    const [last, rest] = s.split(",", 2);
    return { first: (rest ?? "").trim().split(/\s+/)[0] ?? "", last: last.trim() };
  }
  const parts = s.split(/\s+/).filter((p) => !SUFFIX.test(p));
  if (parts.length < 2) return { first: parts[0] ?? "", last: "" };
  return { first: parts[0], last: parts[parts.length - 1] };
}

/** Read a report table (from the CSV parser or the Excel reader). */
export function parseReport(table: Cell[][]): ParsedReport {
  let layout: Layout | null = null;
  let best = 0;
  for (let i = 0; i < Math.min(table.length, 25); i++) {
    const l = layoutOf(table[i] ?? [], i);
    const score = Object.keys(l.cols).length + l.courseCols.length + l.wide.length;
    if (hasPerson(l) && hasDates(l) && score > best) {
      layout = l;
      best = score;
    }
  }
  if (!layout) {
    return {
      rows: [],
      columns: [],
      yptOnly: false,
      error: "Couldn't find the column headings. The report needs a name or member ID column and a date column.",
    };
  }
  const { cols, courseCols, wide } = layout;
  const head = table[layout.header] ?? [];
  const used = [...Object.values(cols), ...courseCols, ...wide.map((w) => w.index)].filter((i): i is number => i !== undefined);
  const columns = [...new Set(used)].sort((a, b) => a - b).map((i) => cellText(head[i]));
  const yptOnly = !courseCols.length && wide.every((w) => w.course === "ypt");
  const get = (row: Cell[], c: Col) => (cols[c] === undefined ? undefined : row[cols[c]!]);

  const rows: ReportRow[] = [];
  for (let r = layout.header + 1; r < table.length; r++) {
    const row = table[r] ?? [];
    let first = cellText(get(row, "first"));
    let last = cellText(get(row, "last"));
    if ((!first || !last) && cols.name !== undefined) ({ first, last } = splitName(cellText(get(row, "name"))));
    const memberId = cellMemberId(get(row, "memberId"));
    if (!memberId && !(first && last)) continue; // blank, a total line, or a sub-heading
    const base = { line: r + 1, memberId, first, last };

    if (wide.length) {
      // One column per course: pair "completed" and "expires" columns of the same course.
      const by = new Map<CourseKey, ReportRow>();
      for (const w of wide) {
        const d = cellDate(row[w.index]);
        if (!d) continue;
        const cur = by.get(w.course) ?? { ...base, courseText: w.header, course: w.course, completed: null, expires: null };
        cur[w.kind] = d;
        by.set(w.course, cur);
      }
      rows.push(...by.values());
      continue;
    }

    const courseText = courseCols.length ? courseCols.map((i) => cellText(row[i])).filter(Boolean).join(" ") : "Safeguarding Youth (YPT report)";
    const completed = cellDate(get(row, "completed"));
    const expires = cellDate(get(row, "expires"));
    if (!completed && !expires) continue;
    rows.push({ ...base, courseText, course: courseCols.length ? courseFromText(courseText) : "ypt", completed, expires });
  }
  return { rows, columns, yptOnly };
}

/** CSV text to a table (handles a leading byte-order mark). */
export function csvTable(text: string): Cell[][] {
  return parseCsv(text.replace(/^﻿/, ""));
}

// ---------------------------------------------------------------------------
// Matching and the update plan
// ---------------------------------------------------------------------------
export interface RosterAdult {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  bsa_member_id: string | null;
  trainings: TrainingRow[];
}

export interface PlannedUpdate {
  key: string;
  adultId: string;
  adultName: string;
  reportName: string;
  course: CourseKey;
  current: TrainingRow | undefined;
  completed: string | null;
  expires: string | null;
  via: "id" | "name";
  /** Reason to look twice; such rows start unticked. */
  warn?: string;
}

export interface Plan {
  updates: PlannedUpdate[];
  upToDate: number;
  unmatched: { label: string; reason: string; rows: number }[];
  unknownCourses: { text: string; rows: number }[];
  memberIdOffers: { adultId: string; adultName: string; memberId: string }[];
}

const key = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const idKey = (s: string | null) => (s ? s.trim().replace(/^0+(?=\d)/, "") : "");
const fullName = (a: RosterAdult) => `${a.preferred_name || a.first_name} ${a.last_name}`;

/** Would this report entry replace what the app has? Mirrors import_trainings() in the database. */
export function isNewer(current: TrainingRow | undefined, completed: string | null, expires: string | null): boolean {
  if (!current || (!current.completed_on && !current.expires_on)) return Boolean(completed || expires);
  if (completed) return !current.completed_on || completed > current.completed_on;
  if (expires) return !current.expires_on || expires > current.expires_on;
  return false;
}

const newerThan = (a: { completed: string | null; expires: string | null }, b: { completed: string | null; expires: string | null }) =>
  (a.completed ?? "") > (b.completed ?? "") || ((a.completed ?? "") === (b.completed ?? "") && (a.expires ?? "") > (b.expires ?? ""));

export function buildPlan(rows: ReportRow[], roster: RosterAdult[], today: string): Plan {
  const byId = new Map<string, RosterAdult[]>();
  const byName = new Map<string, RosterAdult[]>();
  for (const a of roster) {
    if (a.bsa_member_id) byId.set(idKey(a.bsa_member_id), [...(byId.get(idKey(a.bsa_member_id)) ?? []), a]);
    const names = new Set([key(a.first_name) + "|" + key(a.last_name)]);
    if (a.preferred_name) names.add(key(a.preferred_name) + "|" + key(a.last_name));
    for (const n of names) byName.set(n, [...(byName.get(n) ?? []), a]);
  }

  const unknown = new Map<string, number>();
  const unmatched = new Map<string, { label: string; reason: string; rows: number }>();
  const offers = new Map<string, { adultId: string; adultName: string; memberId: string } | null>();
  const best = new Map<string, PlannedUpdate>();
  let upToDate = 0;

  const miss = (r: ReportRow, reason: string) => {
    const label = [`${r.first} ${r.last}`.trim(), r.memberId ? `#${r.memberId}` : ""].filter(Boolean).join(" ");
    const k = label + reason;
    const cur = unmatched.get(k) ?? { label: label || `Row ${r.line}`, reason, rows: 0 };
    cur.rows++;
    unmatched.set(k, cur);
  };

  for (const r of rows) {
    if (!r.course) {
      const t = r.courseText || "(no course name)";
      unknown.set(t, (unknown.get(t) ?? 0) + 1);
      continue;
    }
    if (r.completed && r.completed > today) {
      miss(r, `Finish date ${r.completed} is in the future`);
      continue;
    }
    let adult: RosterAdult | undefined;
    let via: "id" | "name" = "id";
    let warn: string | undefined;
    const idHits = r.memberId ? byId.get(idKey(r.memberId)) ?? [] : [];
    if (idHits.length > 1) {
      miss(r, "That member ID is on more than one adult in the app");
      continue;
    }
    if (idHits.length === 1) {
      adult = idHits[0];
      // Adults can type in their own member ID, so an ID alone isn't proof: the name on the
      // report must agree too. No name match at all means someone may have entered the wrong ID.
      const lastOk = !r.last || key(r.last) === key(adult.last_name);
      const firstOk = !r.first || [adult.first_name, adult.preferred_name].some((n) => n && key(n) === key(r.first));
      if (!lastOk && !firstOk) {
        miss(r, `Member ID is on ${fullName(adult)} in the app, but the report says ${r.first} ${r.last}. Check the member ID`);
        continue;
      }
      if (!lastOk || !firstOk) warn = `Report says ${r.first} ${r.last}`;
    } else {
      const nameHits = r.first && r.last ? byName.get(key(r.first) + "|" + key(r.last)) ?? [] : [];
      if (nameHits.length > 1) {
        miss(r, "More than one adult in the app has that name");
        continue;
      }
      if (!nameHits.length) {
        miss(r, r.memberId ? "No adult with that member ID or name" : "No adult with that name");
        continue;
      }
      adult = nameHits[0];
      via = "name";
      if (r.memberId && adult.bsa_member_id) {
        miss(r, `Name matches ${fullName(adult)}, but their member ID in the app is different`);
        continue;
      }
      if (r.memberId && !adult.bsa_member_id) {
        const prev = offers.get(adult.id);
        if (prev === undefined) offers.set(adult.id, { adultId: adult.id, adultName: fullName(adult), memberId: r.memberId });
        else if (prev && prev.memberId !== r.memberId) offers.set(adult.id, null); // conflicting IDs: don't offer
      }
    }

    const course = r.course;
    const expires = r.expires ?? (r.completed ? defaultExpiry(course, r.completed) : null);
    const completed = r.completed;
    if (completed && expires && expires < completed) {
      miss(r, `${COURSE_BY_KEY[course].label}: expires before it was finished`);
      continue;
    }
    const current = adult.trainings.find((t) => t.course === course);
    if (!isNewer(current, completed, expires)) {
      upToDate++;
      continue;
    }
    const k = `${adult.id}:${course}`;
    const prev = best.get(k);
    const next: PlannedUpdate = {
      key: k,
      adultId: adult.id,
      adultName: fullName(adult),
      reportName: `${r.first} ${r.last}`.trim(),
      course,
      current,
      completed,
      expires,
      via,
      warn,
    };
    if (!prev || newerThan(next, prev)) {
      if (prev) upToDate++;
      best.set(k, next);
    } else upToDate++;
  }

  // A member ID can only be offered to one adult, and not if someone already has it.
  const offered = [...offers.values()].filter((o): o is NonNullable<typeof o> => Boolean(o));
  const memberIdOffers = offered.filter(
    (o) => !byId.has(idKey(o.memberId)) && offered.filter((x) => idKey(x.memberId) === idKey(o.memberId)).length === 1,
  );

  return {
    updates: [...best.values()].sort((a, b) => a.adultName.localeCompare(b.adultName) || a.course.localeCompare(b.course)),
    upToDate,
    unmatched: [...unmatched.values()].sort((a, b) => a.label.localeCompare(b.label)),
    unknownCourses: [...unknown.entries()].map(([text, n]) => ({ text, rows: n })).sort((a, b) => b.rows - a.rows),
    memberIdOffers,
  };
}
