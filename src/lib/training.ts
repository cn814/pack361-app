// Leader training courses the pack tracks, and what each Cub Scout pack position needs to
// count as "trained" (Scouting America rules). Pure data and date helpers: safe to import from
// server or client code.
//
// Sources (checked 2026-09-30):
// - Cub Scout Position Trained Requirements, Oct 2025:
//   https://www.scouting.org/wp-content/uploads/2025/10/Position-Trained-Requirements-Oct2025.pdf
//   Cubmaster/ACM and Den Leader/ADL: position-specific modules plus SCO_800 Hazardous Weather
//   ("Hazardous Weather must be current to retain position trained status for direct contact
//   leaders"). Pack Committee Chair/Member: committee modules (Pack Committee Challenge), no
//   Hazardous Weather. Classroom versions: C40 Cubmaster, C42 Den Leader, C60 Pack Committee.
// - Hazardous Weather FAQ (Dec 2024): required for all direct contact leaders, valid two years.
//   https://www.scouting.org/wp-content/uploads/2024/12/FAQ-Hazardous-Weather-Training-002.pdf
// - Safeguarding Youth (Y01), which replaced Youth Protection Training in 2025: everyone had to
//   take it by May 31, 2026, and it is renewed every year with a short refresher.
//   Commissioner e-blast, Apr 27 2026: "The SYT refresher course must be completed every year."
//   https://filestore.scouting.org/filestore/commissioner/eblast/April-27-Commissioner-Eblast.pdf
//   Also https://michiganscouting.org/safeguarding-youth-training/ and
//   https://www.gtcscouting.org/SYT ("good for one year from the date you originally take or renew it").
// - Trained leader positions: Chartered Organization Representative needs Y01 plus
//   D72 Training the Chartered Org. Rep.
//   https://filestore.scouting.org/filestore/training/pdf/trained_leader_positions.pdf
// - Expiry of program safety courses (Safe Swim Defense, Safety Afloat, Climb On Safely,
//   Trek Safely, Hazardous Weather: two years; BALOO and IOLS: no expiry):
//   https://arbucklebsa.org/training/when-do-trainings-expire/
// - BALOO: at least one adult on every Cub Scout pack overnighter.
//   https://ncacscouting.org/training/baloo/
// - CPR / First Aid is an outside certification (Red Cross Adult First Aid/CPR/AED: two years).
//   https://www.redcross.org/take-a-class/classes/adult-first-aid%2Fcpr%2Faed/LP-00014200.html

import { daysBetween, easternDate } from "./tz";

export type CourseKey =
  | "ypt"
  | "position"
  | "cor"
  | "hazardous_weather"
  | "baloo"
  | "safe_swim"
  | "safety_afloat"
  | "climb_on_safely"
  | "trek_safely"
  | "iols"
  | "wood_badge"
  | "cpr_first_aid";

export interface Course {
  key: CourseKey;
  label: string;
  short: string;
  /** Years a completion stays current; null = doesn't expire. */
  years: number | null;
  /** Who needs it, in plain words. */
  who: string;
  /** Required for at least one pack position (otherwise recommended or for certain outings). */
  required: boolean;
  /** Taken on my.scouting.org, or somewhere else (CPR / First Aid). */
  where: "my.scouting" | "elsewhere";
}

export const COURSES: Course[] = [
  { key: "ypt", label: "Safeguarding Youth (YPT)", short: "YPT", years: 1, who: "Every registered adult. Renew every year.", required: true, where: "my.scouting" },
  { key: "position", label: "Position-specific training", short: "Position", years: null, who: "Cubmaster, den leaders and committee (for their position)", required: true, where: "my.scouting" },
  { key: "cor", label: "Chartered Organization Representative training", short: "COR", years: null, who: "The Chartered Organization Representative", required: true, where: "my.scouting" },
  { key: "hazardous_weather", label: "Hazardous Weather", short: "Weather", years: 2, who: "Required for Cubmasters and den leaders; at least one adult on every outing", required: true, where: "my.scouting" },
  { key: "baloo", label: "BALOO (pack overnighters)", short: "BALOO", years: null, who: "At least one adult at every pack campout", required: false, where: "my.scouting" },
  { key: "safe_swim", label: "Safe Swim Defense", short: "Swim", years: 2, who: "Outings with swimming", required: false, where: "my.scouting" },
  { key: "safety_afloat", label: "Safety Afloat", short: "Afloat", years: 2, who: "Outings with boating", required: false, where: "my.scouting" },
  { key: "climb_on_safely", label: "Climb On Safely", short: "Climb", years: 2, who: "Climbing outings run by the pack", required: false, where: "my.scouting" },
  { key: "trek_safely", label: "Trek Safely", short: "Trek", years: 2, who: "Hikes and treks away from roads and help", required: false, where: "my.scouting" },
  { key: "iols", label: "Introduction to Outdoor Leader Skills (IOLS)", short: "IOLS", years: null, who: "Optional for pack leaders (the Scouts BSA outdoor course)", required: false, where: "my.scouting" },
  { key: "wood_badge", label: "Wood Badge", short: "Wood Badge", years: null, who: "Optional advanced leadership course", required: false, where: "my.scouting" },
  { key: "cpr_first_aid", label: "CPR / First Aid", short: "CPR", years: 2, who: "Recommended for outing leaders (Red Cross, AHA and others)", required: false, where: "elsewhere" },
];

export const COURSE_BY_KEY = Object.fromEntries(COURSES.map((c) => [c.key, c])) as Record<CourseKey, Course>;

export const MY_SCOUTING_URL = "https://my.scouting.org";

/** BSA member IDs: digits only, up to 12. */
export const MEMBER_ID = /^\d{1,12}$/;

export interface TrainingRow {
  adult_id: string;
  course: CourseKey;
  completed_on: string | null;
  expires_on: string | null;
}

export type TrainingState = "current" | "expiring" | "expired" | "missing";

/** Today's date in Eastern time (YYYY-MM-DD). */
export function today(): string {
  return easternDate(Date.now());
}

export function daysLeft(expires: string | null): number | null {
  if (!expires) return null;
  return daysBetween(today(), expires);
}

export function trainingState(row: TrainingRow | undefined): TrainingState {
  if (!row || (!row.completed_on && !row.expires_on)) return "missing";
  const d = daysLeft(row.expires_on);
  if (d === null) return "current";
  if (d < 0) return "expired";
  if (d <= 60) return "expiring";
  return "current";
}

/** Counts as done today (expiring soon still counts). */
export function isCurrent(row: TrainingRow | undefined): boolean {
  const s = trainingState(row);
  return s === "current" || s === "expiring";
}

/** Default expiry for a completion date. */
export function defaultExpiry(course: CourseKey, completedOn: string): string | null {
  const years = COURSE_BY_KEY[course]?.years;
  if (!years || !/^\d{4}-\d{2}-\d{2}$/.test(completedOn)) return null;
  const [y, m, d] = completedOn.split("-").map(Number);
  // Feb 29 + whole years lands on Mar 1 in a non-leap year.
  const end = new Date(Date.UTC(y + years, m - 1, d));
  return end.toISOString().slice(0, 10);
}

/** Reminder thresholds, in days before expiry. */
export const REMINDER_DAYS = [60, 30, 7, 0];

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------
export type PositionKey =
  | "cubmaster"
  | "assistant_cubmaster"
  | "den_leader"
  | "assistant_den_leader"
  | "committee_chair"
  | "committee_member"
  | "cor";

export interface Position {
  key: PositionKey;
  label: string;
  /** Must be current to count as trained for this position. */
  required: CourseKey[];
  /** Good to have; doesn't affect "trained". */
  recommended: CourseKey[];
}

export const POSITIONS: Position[] = [
  { key: "cubmaster", label: "Cubmaster", required: ["ypt", "position", "hazardous_weather"], recommended: ["baloo"] },
  { key: "assistant_cubmaster", label: "Assistant Cubmaster", required: ["ypt", "position", "hazardous_weather"], recommended: ["baloo"] },
  { key: "den_leader", label: "Den Leader", required: ["ypt", "position", "hazardous_weather"], recommended: ["baloo"] },
  { key: "assistant_den_leader", label: "Assistant Den Leader", required: ["ypt", "position", "hazardous_weather"], recommended: ["baloo"] },
  { key: "committee_chair", label: "Committee Chair", required: ["ypt", "position"], recommended: ["hazardous_weather"] },
  { key: "committee_member", label: "Committee Member", required: ["ypt", "position"], recommended: ["hazardous_weather"] },
  { key: "cor", label: "Chartered Organization Representative", required: ["ypt", "cor"], recommended: [] },
];

export const POSITION_BY_KEY = Object.fromEntries(POSITIONS.map((p) => [p.key, p])) as Record<PositionKey, Position>;

/** Committee jobs that are listed by title rather than as "Committee Member". */
const COMMITTEE_WORDS =
  /\b(committee|treasurer|secretary|advancement|membership|outdoor|activities|fundrais\w*|popcorn|pinewood|trainer|coordinator|chair(man|woman|person)?|quartermaster|public relations|webmaster|historian)\b/;

export interface PositionSource {
  role: string;
  position_title: string | null;
  /** Den leader assignments: their titles ("Den Leader", "Assistant Den Leader"). */
  denTitles: string[];
}

/**
 * The scouting positions an adult holds, from their pack position title, den leader
 * assignments and app role. "admin" is an app permission, not a position.
 */
export function positionsFor(a: PositionSource): PositionKey[] {
  const out = new Set<PositionKey>();
  const title = (a.position_title ?? "").toLowerCase();
  // A title can list several jobs: "Cubmaster / Treasurer".
  for (const part of title.split(/[\/,;&+]| and /)) {
    const t = part.trim();
    if (!t) continue;
    if (/\b(chartered|charter)\s*org|\bcor\b|\bco rep\b/.test(t)) out.add("cor");
    else if (/assistant\s+cubmaster|\bacm\b/.test(t)) out.add("assistant_cubmaster");
    else if (/cubmaster/.test(t)) out.add("cubmaster");
    else if (/assistant\s+den\s+leader|\badl\b/.test(t)) out.add("assistant_den_leader");
    else if (/den\s+leader/.test(t)) out.add("den_leader");
    else if (/committee\s+chair|^chair(man|woman|person)?$|\bcc\b/.test(t)) out.add("committee_chair");
    else if (COMMITTEE_WORDS.test(t)) out.add("committee_member");
  }
  for (const d of a.denTitles) out.add(/assistant/i.test(d) ? "assistant_den_leader" : "den_leader");

  if (a.role === "cubmaster" && !out.has("cubmaster") && !out.has("assistant_cubmaster")) out.add("cubmaster");
  if (a.role === "den_leader" && !out.has("den_leader") && !out.has("assistant_den_leader")) out.add("den_leader");
  if (a.role === "committee" && !out.has("committee_chair") && !out.has("committee_member")) out.add("committee_member");
  if (out.has("committee_chair")) out.delete("committee_member");
  return POSITIONS.map((p) => p.key).filter((k) => out.has(k));
}

export interface TrainedStatus {
  positions: PositionKey[];
  /** Required courses that aren't current. Empty = trained. */
  missing: CourseKey[];
  /** Recommended courses that aren't current. */
  suggested: CourseKey[];
  /** All required courses, in course order. */
  required: CourseKey[];
  trained: boolean;
}

/** Is this adult trained for every position they hold? With no position, Safeguarding Youth is what counts. */
export function trainedStatus(positions: PositionKey[], rows: TrainingRow[]): TrainedStatus {
  const req = new Set<CourseKey>(["ypt"]);
  const rec = new Set<CourseKey>();
  for (const p of positions) {
    POSITION_BY_KEY[p].required.forEach((c) => req.add(c));
    POSITION_BY_KEY[p].recommended.forEach((c) => rec.add(c));
  }
  const ok = (c: CourseKey) => isCurrent(rows.find((r) => r.course === c));
  const order = COURSES.map((c) => c.key);
  const required = order.filter((c) => req.has(c));
  const missing = required.filter((c) => !ok(c));
  const suggested = order.filter((c) => rec.has(c) && !req.has(c) && !ok(c));
  return { positions, missing, suggested, required, trained: missing.length === 0 };
}

export function positionLabels(positions: PositionKey[]): string {
  return positions.map((p) => POSITION_BY_KEY[p].label).join(", ");
}
