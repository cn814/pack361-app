import "server-only";
import { courseFromText, type ReportRow } from "./training-import";

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

const LOGIN = "https://my.scouting.org/api/users";
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

async function signIn(): Promise<{ token: string; userId: string; personGuid: string }> {
  const username = process.env.MYSCOUTING_USERNAME!;
  const res = await request(`${LOGIN}/${encodeURIComponent(username)}/authenticate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json; version=2",
      "User-Agent": "Mozilla/5.0 (Pack 361 app)",
    },
    body: new URLSearchParams({ password: process.env.MYSCOUTING_PASSWORD! }).toString(),
  });
  if (res.status === 401 || res.status === 403) throw new StepError("my.scouting didn't accept the username or password.");
  if (!res.ok) throw new StepError(`my.scouting sign-in answered ${res.status}.`);
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
// Advancement: connection test (step 1 of the automatic Scoutbook import)
// ---------------------------------------------------------------------------
// Scoutbook Plus reads advancement one scout at a time (seen in its own pages, 2026-10-02):
//   GET /organizations/v2/units/{unit}/youths
//   GET /advancements/v2/youth/{userId}/ranks | adventures | awards
//   GET /advancements/v2/youth/{userId}/adventures/{adventureId}/requirements (ranks/... likewise)
// Their answers aren't documented, so this test reports only their SHAPE (field names and kinds
// of values, list lengths) for one scout, never names, dates or other values. That's what the
// real import is then written against.

type Shape = string | Shape[] | { [k: string]: Shape };

const LOOKS_LIKE_DATA_KEY = /^[0-9a-f-]{8,}$|^\d+$|\s/i;

/** Field names and value kinds only. Maps keyed by IDs or names are summarized, not listed. */
function shapeOf(v: unknown, depth = 0): Shape {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return v.length ? [`list of ${v.length}`, shapeOf(v[0], depth + 1)] : "empty list";
  if (typeof v === "object") {
    if (depth > 4) return "object";
    const entries = Object.entries(v as Json);
    if (entries.length > 40 || entries.some(([k]) => LOOKS_LIKE_DATA_KEY.test(k))) return `map of ${entries.length} entries`;
    return Object.fromEntries(entries.map(([k, x]) => [k, shapeOf(x, depth + 1)]));
  }
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{1,2}\/\d{1,2}\/\d{4}/.test(v) ? "date" : v === "" ? "empty text" : "text";
  return typeof v;
}

function firstList(data: unknown): Json[] {
  if (Array.isArray(data)) return data.filter((x) => x && typeof x === "object") as Json[];
  return objectArrays(data)[0] ?? [];
}

export interface ProbeResult {
  steps: string[];
  shapes: Record<string, Shape>;
  error?: string;
}

/** Sign in, read the youth roster and one scout's advancement, and report only the shapes. */
export async function probeMyScoutingAdvancement(): Promise<ProbeResult> {
  const steps: string[] = [];
  const shapes: Record<string, Shape> = {};
  if (!myScoutingConfigured()) return { steps, shapes, error: "Not set up: MYSCOUTING_USERNAME and MYSCOUTING_PASSWORD aren't set in Vercel." };
  try {
    const s = await signIn();
    steps.push("Signed in to my.scouting.");
    const get = api(s.token);
    const unit = await findUnit(get, s.userId, s.personGuid);
    steps.push(`Found ${unit.name}.`);

    const ys = await get(`/organizations/v2/units/${unit.guid}/youths`);
    if (ys.status !== 200) throw new StepError(`Reading the youth roster answered ${ys.status}. The account may need Key 3 or advancement access.`);
    const youths = firstList(ys.data);
    steps.push(`Youth roster: ${youths.length} scouts.`);
    shapes.youths = shapeOf(ys.data);
    const one = youths.find((y) => str(pick(y, /^userId$/i)));
    const uid = one ? str(pick(one, /^userId$/i)) : "";
    if (!uid) throw new StepError("The youth roster has no userId field this app recognizes (see the shape below).");

    for (const kind of ["ranks", "adventures", "awards"] as const) {
      const r = await get(`/advancements/v2/youth/${uid}/${kind}`);
      steps.push(`One scout's ${kind}: answered ${r.status}.`);
      shapes[kind] = r.status === 200 ? shapeOf(r.data) : `answered ${r.status}`;
      if (r.status !== 200) continue;
      // Requirements for the first item that has an id.
      const items = objectArrays(r.data).flat();
      const item = items.find((x) => str(pick(x, /^(id|adventureId|rankId|awardId)$/i)));
      const id = item ? str(pick(item, /^(id|adventureId|rankId|awardId)$/i)) : "";
      if (kind !== "awards" && id) {
        const q = await get(`/advancements/v2/youth/${uid}/${kind}/${id}/requirements`);
        steps.push(`Requirements for one of those ${kind}: answered ${q.status}.`);
        shapes[`${kind}_requirements`] = q.status === 200 ? shapeOf(q.data) : `answered ${q.status}`;
      }
    }
    return { steps, shapes };
  } catch (e) {
    const msg =
      e instanceof StepError
        ? e.message
        : e instanceof Error && e.name === "AbortError"
          ? "my.scouting didn't answer in time."
          : "Couldn't reach my.scouting.";
    return { steps, shapes, error: msg };
  }
}
