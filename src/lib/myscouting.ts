import "server-only";
import { courseFromText, type ReportRow } from "./training-import";
import type { ScoutbookLine } from "./advancement";

// EXPERIMENTAL: reads the pack's adult training straight from my.scouting, using the same
// unofficial web API that Scoutbook Plus uses. Scouting America doesn't offer an official API, so
// this signs in with a real my.scouting account (a Key 3 delegate's, set as Vercel environment
// variables MYSCOUTING_USERNAME and MYSCOUTING_PASSWORD) and may stop working whenever Scouting
// America changes its site. It only ever READS: one sign-in request, then GET requests.
// The password is used for that one sign-in request on the server and is never stored, logged,
// sent to the browser or saved in the database. The result goes through the same preview and
// "only newer dates" rules as the uploaded report.
//
// Community documentation of these endpoints (checked 2026-10-02):
//   github.com/mmarseglia/scouting-api (sign-in, token fields), github.com/natbros-git/scouts-cli
//   (person profile, unit adults roster, Youth Protection training).

// Sign-in moved to auth.scouting.org (Scoutbook Plus's own pages, 2026-10-02); my.scouting.org
// answered 503. Both are tried, newest first.
const LOGINS = ["https://auth.scouting.org/api/users", "https://my.scouting.org/api/users"];
const API = "https://api.scouting.org";
const WEB = "https://advancements.scouting.org";
/** The unit to read: Pack 361. MYSCOUTING_ORG_GUID overrides the automatic lookup. */
const UNIT = { type: /pack/i, number: "361" };
const TIMEOUT_MS = 20000;
const MAX_ADULTS = 150;

export function myScoutingConfigured() {
  return Boolean(process.env.MYSCOUTING_USERNAME && process.env.MYSCOUTING_PASSWORD);
}

export interface SyncResult {
  rows: ReportRow[];
  /** What happened, step by step, for the page (never contains the password or token). */
  steps: string[];
  error?: string;
}

type Json = Record<string, unknown>;

class StepError extends Error {}

async function request(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

/** The claims inside the sign-in token (uid = user ID, pgu = person GUID). */
function claims(token: string): Json {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as Json;
  } catch {
    return {};
  }
}

/** my.scouting's own words when it refuses, trimmed (never includes what was sent). */
async function why(res: Response): Promise<string> {
  const text = (await res.text().catch(() => "")).replace(/eyJ[\w.-]+/g, "…").replace(/\s+/g, " ").trim();
  if (!text || /^<!doctype|^<html/i.test(text)) return "";
  try {
    const j = JSON.parse(text) as Json;
    const m = [j.message, j.error, j.errorDescription, j.code].map(str).filter(Boolean).join(" ");
    if (m) return ` It said: "${m.slice(0, 200)}".`;
  } catch {}
  return ` It said: "${text.slice(0, 200)}".`;
}

async function signIn(): Promise<{ token: string; userId: string; personGuid: string }> {
  const username = process.env.MYSCOUTING_USERNAME!;
  let res: Response | null = null;
  const tried: string[] = [];
  for (const base of LOGINS) {
    res = await request(`${base}/${encodeURIComponent(username)}/authenticate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json; version=2",
        Origin: WEB,
        Referer: `${WEB}/`,
        "User-Agent": "Mozilla/5.0 (Pack 361 app)",
      },
      body: new URLSearchParams({ password: process.env.MYSCOUTING_PASSWORD! }).toString(),
    });
    tried.push(`${new URL(base).host} ${res.status}`);
    if (res.status < 500 && res.status !== 404) break;
  }
  if (!res) throw new StepError("Couldn't reach my.scouting.");
  if (res.status === 401 || res.status === 403) {
    const said = await why(res);
    throw new StepError(
      /captcha|robot|verif/i.test(said)
        ? `my.scouting wants a "not a robot" check at sign-in, which an app can't do.${said}`
        : `my.scouting didn't accept the sign-in (${tried.join(", ")}).${said}`,
    );
  }
  if (!res.ok) throw new StepError(`my.scouting sign-in failed (${tried.join(", ")}).${await why(res)}`);
  const body = (await res.json().catch(() => ({}))) as Json;
  const token = typeof body.token === "string" ? body.token : "";
  if (!token) {
    throw new StepError(
      "my.scouting signed in but didn't return a token. It may now ask for a second step (a code or a check) that an app can't answer.",
    );
  }
  const c = claims(token);
  const account = (body.account ?? {}) as Json;
  return { token, userId: String(account.userId ?? c.uid ?? ""), personGuid: String(c.pgu ?? "") };
}

function api(token: string) {
  return async (path: string): Promise<{ status: number; data: unknown }> => {
    const res = await request(`${API}${path}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "x-esb-url": Buffer.from(`${WEB}/roster`).toString("base64"),
        Origin: WEB,
        Referer: `${WEB}/`,
      },
    });
    return { status: res.status, data: res.ok ? await res.json().catch(() => null) : null };
  };
}

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
/** "2026-05-26T00:00:00", "05/26/2026" → "2026-05-26". */
function isoDate(v: unknown): string | null {
  const s = str(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}
/** The first value among these keys (case-insensitive) on an object. */
function pick(o: Json, re: RegExp): unknown {
  for (const [k, v] of Object.entries(o)) if (re.test(k) && v !== null && v !== "") return v;
  return undefined;
}
/** Every array of objects anywhere inside a response. */
function objectArrays(v: unknown, out: Json[][] = [], depth = 0): Json[][] {
  if (depth > 4 || !v || typeof v !== "object") return out;
  if (Array.isArray(v)) {
    if (v.length && v.every((x) => x && typeof x === "object" && !Array.isArray(x))) out.push(v as Json[]);
    for (const x of v) objectArrays(x, out, depth + 1);
  } else for (const x of Object.values(v)) objectArrays(x, out, depth + 1);
  return out;
}

/** Find Pack 361's organization GUID from the signed-in person's positions. */
async function findUnit(get: ReturnType<typeof api>, userId: string, personGuid: string): Promise<{ guid: string; name: string }> {
  const fixed = process.env.MYSCOUTING_ORG_GUID?.trim();
  if (fixed) return { guid: fixed, name: "Pack 361 (set in MYSCOUTING_ORG_GUID)" };
  const tries = [userId && `/persons/v2/${userId}/personprofile`, personGuid && `/persons/${personGuid}/roleTypes`].filter(Boolean) as string[];
  for (const path of tries) {
    const { status, data } = await get(path);
    if (status !== 200) continue;
    for (const list of objectArrays(data)) {
      for (const o of list) {
        const guid = str(pick(o, /^(organizationGuid|orgGuid)$/i));
        const type = str(pick(o, /^(unitType|organizationType)$/i)) + " " + str(pick(o, /^(organizationName|unitName|name)$/i));
        const num = str(pick(o, /^(unitNumber|number)$/i)).replace(/^0+/, "");
        if (guid && UNIT.type.test(type) && (num === UNIT.number || new RegExp(`\\b0*${UNIT.number}\\b`).test(type))) {
          return { guid, name: str(pick(o, /^(organizationName|unitName)$/i)) || `Pack ${UNIT.number}` };
        }
      }
    }
  }
  throw new StepError(
    "Signed in, but couldn't find Pack 361 among this account's positions. Set MYSCOUTING_ORG_GUID, or use an account with a Pack 361 position.",
  );
}

interface UnitAdult {
  first: string;
  last: string;
  memberId: string | null;
  personGuid: string;
  raw: Json;
}

/** Training-looking entries in a response: a course name or code with a completion or expiration date. */
function trainingEntries(data: unknown): { course: string; completed: string | null; expires: string | null }[] {
  const out: { course: string; completed: string | null; expires: string | null }[] = [];
  for (const list of objectArrays(data)) {
    for (const o of list) {
      const course = [pick(o, /^(courseName|trainingName|courseTitle|name|title)$/i), pick(o, /^(courseCode|code|courseId)$/i)]
        .map(str)
        .filter(Boolean)
        .join(" ");
      const completed = isoDate(pick(o, /complet|dateTaken|trainedDate|takenOn/i));
      const expires = isoDate(pick(o, /expir|validThrough|dueDate/i));
      if (course && (completed || expires)) out.push({ course, completed, expires });
    }
  }
  return out;
}

/** Read every adult's training for Pack 361. */
export async function fetchMyScoutingTraining(): Promise<SyncResult> {
  const steps: string[] = [];
  if (!myScoutingConfigured()) return { rows: [], steps, error: "Not set up: MYSCOUTING_USERNAME and MYSCOUTING_PASSWORD aren't set in Vercel." };
  try {
    const s = await signIn();
    steps.push("Signed in to my.scouting.");
    const get = api(s.token);

    const unit = await findUnit(get, s.userId, s.personGuid);
    steps.push(`Found ${unit.name}.`);

    const roster = await get(`/organizations/v2/units/${unit.guid}/adults`);
    if (roster.status !== 200) {
      throw new StepError(
        roster.status === 401 || roster.status === 403
          ? "my.scouting wouldn't share the adult roster with this account. It needs a Key 3 or Key 3 delegate role for Pack 361."
          : `Reading the adult roster failed (${roster.status}).`,
      );
    }
    const adults: UnitAdult[] = [];
    const seen = new Set<string>();
    for (const list of objectArrays(roster.data)) {
      for (const o of list) {
        const personGuid = str(pick(o, /^personGuid$/i));
        const first = str(pick(o, /^firstName$/i));
        const last = str(pick(o, /^lastName$/i));
        if (!personGuid || !last || seen.has(personGuid)) continue;
        seen.add(personGuid);
        adults.push({ first, last, memberId: str(pick(o, /^(memberId|bsaMemberId|memberID)$/i)) || null, personGuid, raw: o });
      }
    }
    if (!adults.length) throw new StepError("The adult roster came back empty, or in a shape this app doesn't recognize.");
    steps.push(`Read ${adults.length} adults on the Pack 361 roster.`);

    const rows: ReportRow[] = [];
    let line = 0;
    let ypt = 0;
    let other = 0;
    let fullTrainingWorked = false;
    const add = (a: UnitAdult, courseText: string, completed: string | null, expires: string | null) => {
      rows.push({ line: ++line, memberId: a.memberId, first: a.first, last: a.last, courseText, course: courseFromText(courseText), completed, expires });
    };

    for (const a of adults.slice(0, MAX_ADULTS)) {
      // Safeguarding Youth (Youth Protection) from its own endpoint.
      const y = await get(`/persons/v2/${a.personGuid}/trainings/ypt`);
      if (y.status === 200 && y.data && typeof y.data === "object") {
        const d = y.data as Json;
        const completed = isoDate(pick(d, /^yptCompletionDate$|complet/i));
        const expires = isoDate(pick(d, /^yptExpireDate$|expir/i));
        if (completed || expires) {
          add(a, "Safeguarding Youth (YPT)", completed, expires);
          ypt++;
        }
      }
      // Everything else (position training, Hazardous Weather, BALOO...), where my.scouting shares it.
      const t = await get(`/persons/${a.personGuid}/trainings`);
      if (t.status === 200) {
        fullTrainingWorked = true;
        for (const e of trainingEntries(t.data)) {
          add(a, e.course, e.completed, e.expires);
          other++;
        }
      }
      // Some rosters carry training dates on each person, too.
      for (const e of trainingEntries([a.raw])) {
        add(a, e.course, e.completed, e.expires);
        other++;
      }
    }
    if (adults.length > MAX_ADULTS) steps.push(`Read the first ${MAX_ADULTS} adults only.`);
    steps.push(`Safeguarding Youth dates for ${ypt} adult${ypt === 1 ? "" : "s"}.`);
    steps.push(
      fullTrainingWorked
        ? `${other} other training records (position, Hazardous Weather and others).`
        : "my.scouting didn't share other training (position, Hazardous Weather) with this account, so only Safeguarding Youth came through. Upload the training report for the rest.",
    );
    return { rows, steps };
  } catch (e) {
    const msg =
      e instanceof StepError
        ? e.message
        : e instanceof Error && e.name === "AbortError"
          ? "my.scouting didn't answer in time."
          : "Couldn't reach my.scouting.";
    return { rows: [], steps, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Advancement: every scout's completed ranks, adventures, requirements and awards
// ---------------------------------------------------------------------------
// Scoutbook Plus reads advancement one scout at a time (its own pages, checked 2026-10-02):
//   GET /organizations/v2/units/{unit}/youths                   -> users[]: userId, memberId, names
//   GET /advancements/v2/youth/{userId}/ranks                   -> program[].ranks[]: name, version, dateEarned...
//   GET /advancements/v2/youth/{userId}/ranks/{id}/requirements -> requirements[]: requirementNumber, dateCompleted...
//   GET /advancements/v2/youth/{userId}/adventures              -> []: adventureName, version, dateCompleted...
//   GET /advancements/v2/youth/{userId}/adventures/{id}/requirements
//   GET /advancements/v2/youth/{userId}/awards
// The result is turned into the same lines as Scoutbook's "Quick Export -> Advancements" CSV
// (completed items only, labelled the same way), so it goes through the same import.

const PARALLEL = 8;
const TIME_BUDGET_MS = 240_000;

export interface AdvancementSync {
  lines: ScoutbookLine[];
  steps: string[];
  scoutsRead: number;
  /** Scouts left out because Scoutbook didn't answer for them (their records stay as they are). */
  skipped: { name: string; reason: string }[];
  error?: string;
}

/** Run at most `n` requests at a time. */
function limiter(n: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= n) await new Promise<void>((r) => queue.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

const done = (o: Json, re: RegExp) => isoDate(pick(o, re));
// Scoutbook's site and its CSV export spell a few things differently; the import matches the
// export, so records keep the same labels whichever way they arrive (compared 2026-10-02).
const EXPORT_NAMES: Record<string, string> = {
  "Tiger Roar": "Tiger's Roar",
  "Tiger Circles: Duty to God": "My Family\u2019s Duty to God",
};
/** An adventure's name as the export writes it. Its own line uses semicolons for commas
 * ("Stronger; Faster; Higher Adventure"); its requirements keep the commas. */
const exportName = (name: string) => EXPORT_NAMES[name.trim()] ?? name.trim();

/** Requirement numbers as the export writes them: "3." is "3", and a lone "a" under "3" is "3a". */
function requirementNumbers(list: Json[]): Map<Json, string> {
  const own = (x: Json) => (str(x.requirementNumber) || str(x.listNumber).replace(/[()]/g, "")).trim().replace(/\.$/, "");
  const byId = new Map<string, Json>();
  for (const x of list) {
    const id = str(x.requirementId ?? x.id);
    if (id) byId.set(id, x);
  }
  const out = new Map<Json, string>();
  for (const x of list) {
    let n = own(x);
    const parent = byId.get(str(x.parentRequirementId));
    if (/^[a-z]$/i.test(n) && parent) n = `${own(parent)}${n}`;
    out.set(x, n);
  }
  return out;
}

/** The requirements list of a requirements answer (only its own items, not nested lists). */
const reqList = (data: unknown): Json[] => {
  const r = data && typeof data === "object" ? (data as Json).requirements : null;
  return Array.isArray(r) ? (r.filter((x) => x && typeof x === "object") as Json[]) : [];
};
const flag = (v: unknown) => v === true || /^(true|yes|1)$/i.test(str(v));

/** Read every scout's advancement from Scoutbook, as export lines. Read-only. */
export async function fetchScoutbookAdvancement(): Promise<AdvancementSync> {
  const steps: string[] = [];
  const lines: ScoutbookLine[] = [];
  const skipped: AdvancementSync["skipped"] = [];
  if (!myScoutingConfigured()) {
    return { lines, steps, scoutsRead: 0, skipped, error: "Not set up: MYSCOUTING_USERNAME and MYSCOUTING_PASSWORD aren't set in Vercel." };
  }
  const started = Date.now();
  try {
    const s = await signIn();
    steps.push("Signed in to Scoutbook.");
    const raw = api(s.token);
    const run = limiter(PARALLEL);
    let requests = 0;
    const get = (path: string) => {
      requests++;
      return run(() => raw(path));
    };
    const unit = await findUnit(raw, s.userId, s.personGuid);
    steps.push(`Found ${unit.name}.`);

    const ys = await get(`/organizations/v2/units/${unit.guid}/youths`);
    if (ys.status !== 200) throw new StepError(`Reading the youth roster answered ${ys.status}. The account may need Key 3 or advancement access.`);
    const youths = (objectArrays(ys.data).find((l) => l.some((y) => "userId" in y && "memberId" in y)) ?? []).filter(
      (y) => str(y.userId) && str(y.memberId),
    );
    if (!youths.length) throw new StepError("The youth roster came back empty, or in a shape this app doesn't recognize.");
    steps.push(`Youth roster: ${youths.length} scouts.`);

    let read = 0;
    await Promise.all(
      youths.map(async (y) => {
        const uid = str(y.userId);
        const memberId = str(y.memberId).replace(/^0+(?=\d)/, "");
        const name = `${str(y.firstName)} ${str(y.lastName)}`.trim();
        const mine: ScoutbookLine[] = [];
        const add = (type: string, adv: string, version: string, o: Json, completed: string | null) => {
          if (!completed || !adv) return;
          mine.push({
            member_id: memberId,
            name,
            type,
            adv,
            version,
            completed_on: completed,
            approved: Boolean(done(o, /^leaderApprovedDate$/i)),
            awarded: flag(o.awarded) || Boolean(done(o, /^awardedDate$/i)),
            awarded_on: done(o, /^awardedDate$/i),
          });
        };
        const fail = (what: string, status: number) => {
          throw new StepError(`${what} answered ${status}`);
        };
        try {
          if (Date.now() - started > TIME_BUDGET_MS) throw new StepError("ran out of time");
          const [rk, ad, aw] = await Promise.all([
            get(`/advancements/v2/youth/${uid}/ranks`),
            get(`/advancements/v2/youth/${uid}/adventures`),
            get(`/advancements/v2/youth/${uid}/awards`),
          ]);
          if (rk.status !== 200) fail("ranks", rk.status);
          if (ad.status !== 200) fail("adventures", ad.status);
          if (aw.status !== 200 && aw.status !== 404) fail("awards", aw.status);

          // Ranks, and the requirements of any rank with progress.
          const ranks = objectArrays(rk.data).flat().filter((r) => str(r.name) && "versionId" in r && !("requirementNumber" in r));
          const rankReqs = ranks.map(async (r) => {
            const rname = str(r.name);
            const version = str(r.version);
            add("Rank", `${rname} Rank`, version, r, done(r, /^dateEarned$/i));
            const progress = Number(r.percentCompleted ?? 0) > 0 || done(r, /^dateEarned$/i);
            if (!progress || !str(r.id)) return;
            const q = await get(`/advancements/v2/youth/${uid}/ranks/${str(r.id)}/requirements`);
            if (q.status !== 200) fail("rank requirements", q.status);
            const list = reqList(q.data);
            const nums = requirementNumbers(list);
            for (const x of list) add(`${rname} Rank Requirements`, nums.get(x) ?? "", version, x, done(x, /^dateCompleted$/i));
          });

          // Adventures, and the requirements of any adventure with progress.
          const adventures = objectArrays(ad.data).flat().filter((a) => str(a.adventureName) && str(a.adventureId));
          const advReqs = adventures.map(async (a) => {
            const aname = exportName(str(a.adventureName));
            const version = str(a.version);
            add("Adventure", `${aname.replace(/,/g, ";")} Adventure`, version, a, done(a, /^dateCompleted$/i));
            const progress = Number(a.percentCompleted ?? 0) > 0 || done(a, /^dateCompleted$/i);
            if (!progress) return;
            const q = await get(`/advancements/v2/youth/${uid}/adventures/${str(a.adventureId)}/requirements`);
            if (q.status !== 200) fail("adventure requirements", q.status);
            const list = reqList(q.data);
            const nums = requirementNumbers(list);
            for (const x of list) add(`${aname} Adventure Requirements`, nums.get(x) ?? "", version, x, done(x, /^dateCompleted$/i));
          });

          // Awards (Totin' Chip, Whittling Chip...).
          if (aw.status === 200) {
            for (const w of objectArrays(aw.data).flat()) {
              const wname = str(pick(w, /^(awardName|name|short)$/i));
              add("Awards", wname, str(w.version), w, done(w, /^(dateEarned|dateCompleted)$/i));
            }
          }
          await Promise.all([...rankReqs, ...advReqs]);
          lines.push(...mine);
          read++;
        } catch (e) {
          skipped.push({ name, reason: e instanceof StepError ? e.message : e instanceof Error && e.name === "AbortError" ? "timed out" : "couldn't be read" });
        }
      }),
    );
    steps.push(`Read ${read} scout${read === 1 ? "" : "s"} (${requests} requests, ${Math.round((Date.now() - started) / 1000)} seconds).`);
    if (skipped.length) steps.push(`${skipped.length} scout${skipped.length === 1 ? "" : "s"} skipped; their records stay as they are.`);
    return { lines, steps, scoutsRead: read, skipped };
  } catch (e) {
    const msg =
      e instanceof StepError
        ? e.message
        : e instanceof Error && e.name === "AbortError"
          ? "Scoutbook didn't answer in time."
          : "Couldn't reach Scoutbook.";
    return { lines, steps, scoutsRead: 0, skipped, error: msg };
  }
}
