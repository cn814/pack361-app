// Matching a Givebutter dues payment to a family and its scouts. Pure: no database, no network.
//
// The dues form asks for the scouts' names, their den, the parents' names and emails and phone
// numbers. Those answers are used here, during the sync, and never stored: only the matched
// family, scout ids and a short note (with no names in it) are saved.
//
// Givebutter's custom-field answers aren't well documented, so read them defensively. Seen or
// expected shapes, on the transaction or on its nested payment attempts (t.transactions[*]):
//   custom_fields: [{ title | label | name | question: "...", value | answer | response: "..." }]
//   custom_fields: [{ field: { title: "..." }, value: "..." }]
//   custom_fields: { "Question": "Answer", ... }
// An answer can be text, a number, a list (multi-select) or { value: ... }.

type Json = Record<string, unknown>;

export interface Answer {
  question: string;
  answer: string;
}

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function text(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(", ");
  if (isObj(v)) return text(v.value ?? v.answer ?? v.response ?? v.label ?? v.name ?? "");
  return String(v).trim();
}

function firstText(o: Json, keys: string[]): string {
  for (const k of keys) {
    const t = text(o[k]);
    if (t) return t;
  }
  return "";
}

function fromFields(cf: unknown): Answer[] {
  if (Array.isArray(cf)) {
    return cf.filter(isObj).flatMap((f) => {
      const nested = isObj(f.field) ? f.field : isObj(f.custom_field) ? f.custom_field : null;
      const question = firstText(f, ["title", "label", "name", "question"]) || (nested ? firstText(nested, ["title", "label", "name", "question"]) : "");
      const answer = firstText(f, ["value", "answer", "response"]);
      return question && answer ? [{ question, answer }] : [];
    });
  }
  if (isObj(cf)) {
    return Object.entries(cf).flatMap(([question, v]) => {
      const answer = text(v);
      return question && answer ? [{ question, answer }] : [];
    });
  }
  return [];
}

/** Every custom-field answer on a transaction (and its nested payment attempts). */
export function customAnswers(t: Json): Answer[] {
  const nested = Array.isArray(t.transactions) ? (t.transactions as unknown[]).filter(isObj) : [];
  const all = [...fromFields(t.custom_fields), ...nested.flatMap((x) => fromFields(x.custom_fields))];
  const seen = new Set<string>();
  return all.filter((a) => {
    const k = `${a.question}\u0000${a.answer}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const EMAIL = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export interface DuesAnswers {
  scoutNames: string[];
  parentEmails: string[];
}

/** The answers that matter for dues, found by keyword (the wording, and spelling, can change). */
export function duesAnswers(answers: Answer[]): DuesAnswers {
  const scoutText = answers
    .filter((a) => /scout/i.test(a.question) && /name/i.test(a.question) && !/parent|guardian/i.test(a.question))
    .map((a) => a.answer);
  const emails = answers
    .filter((a) => /e-?mail/i.test(a.question))
    .flatMap((a) => a.answer.match(EMAIL) ?? [])
    .map((e) => e.toLowerCase());
  return { scoutNames: scoutText.flatMap(splitNames), parentEmails: [...new Set(emails)] };
}

/** "Sky Smith, River & Jo" -> ["Sky Smith", "River", "Jo"]. Splits on , ; / & "and" and new lines. */
export function splitNames(s: string): string[] {
  return s
    .replace(/\([^)]*\)/g, " ")
    .split(/[,;/&\n\r]+|\s+and\s+|\s*\+\s*/i)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Lower case, accents off, letters only, as words: "José-Luis" -> ["jose", "luis"]. */
export function nameWords(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .replace(/['-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export interface RosterScout {
  id: string;
  first_name: string;
  last_name: string;
}

/**
 * Match typed names to a family's scouts by first name (last names are ignored). A typed name
 * that's only the family's last name ("Smith, Sky") is skipped, not counted as a miss.
 */
export function matchScoutNames(names: string[], scouts: RosterScout[]): { ids: string[]; unmatched: number } {
  const ids: string[] = [];
  let unmatched = 0;
  const lastNames = new Set(scouts.map((s) => nameWords(s.last_name).join(" ")));
  for (const name of names) {
    const words = nameWords(name);
    if (!words.length) continue;
    const hit = scouts.find((s) => {
      if (ids.includes(s.id)) return false;
      const first = nameWords(s.first_name);
      return first.length > 0 && first.every((w, i) => words[i] === w);
    });
    if (hit) ids.push(hit.id);
    else if (!lastNames.has(words.join(" "))) unmatched++;
  }
  return { ids, unmatched };
}

/** Dues for n scouts: full dues for the first, less the sibling discount for each one after. */
export function duesTotalCents(n: number, fullCents: number, discountCents: number): number {
  if (n <= 0) return 0;
  return fullCents + (n - 1) * Math.max(fullCents - discountCents, 0);
}

export interface DuesPlan {
  familyId: string | null;
  scoutIds: string[];
  match: "matched" | "partial" | "needs_review";
  note: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Decide who a dues payment was for. familyByEmail: roster emails (lower case) -> family.
 * scoutsByFamily: each family's active scouts.
 */
export function planDuesMatch(
  t: { email: string | null; amountCents: number; answers: Answer[] },
  familyByEmail: Map<string, string>,
  scoutsByFamily: Map<string, RosterScout[]>,
  fullCents: number,
  discountCents: number,
): DuesPlan {
  const { scoutNames, parentEmails } = duesAnswers(t.answers);
  const emails = [t.email?.toLowerCase() ?? "", ...parentEmails].filter(Boolean);
  const familyId = emails.map((e) => familyByEmail.get(e)).find(Boolean) ?? null;
  if (!familyId) return { familyId: null, scoutIds: [], match: "needs_review", note: "No email matched a pack family" };
  const scouts = scoutsByFamily.get(familyId) ?? [];
  if (!scouts.length) return { familyId, scoutIds: [], match: "needs_review", note: "Family has no active scouts" };

  const { ids, unmatched } = matchScoutNames(scoutNames, scouts);
  if (ids.length) {
    const total = ids.length + unmatched;
    return unmatched
      ? { familyId, scoutIds: ids, match: "partial", note: `${plural(unmatched, "scout name")} didn't match` }
      : { familyId, scoutIds: ids, match: "matched", note: `${ids.length} of ${total} ${total === 1 ? "scout" : "scouts"} matched` };
  }
  // With or without the sibling discount (it's optional).
  if (fullCents > 0 && [discountCents, 0].some((d) => t.amountCents === duesTotalCents(scouts.length, fullCents, d))) {
    return { familyId, scoutIds: scouts.map((s) => s.id), match: "matched", note: `Matched by amount: ${plural(scouts.length, "scout")}` };
  }
  return {
    familyId,
    scoutIds: [],
    match: "needs_review",
    note: scoutNames.length ? `${plural(scoutNames.length, "scout name")} didn't match` : "No scout names given",
  };
}
