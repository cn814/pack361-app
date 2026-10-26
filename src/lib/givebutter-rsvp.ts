// Givebutter ticket names → how many scouts, siblings and adults a family is bringing.
// Runs in memory during the sync; the names are never stored.

export interface Headcount {
  scouts: number;
  siblings: number;
  adults: number;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");

/** Same person? Exact, one name starting the other (Chris / Christopher), or the same first 3 letters (Anne / Annie). */
export function sameName(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length >= 3 && y.length >= 3 && (x.startsWith(y) || y.startsWith(x) || x.slice(0, 3) === y.slice(0, 3))) return true;
  return false;
}

/**
 * Sort a family's ticket names: a name that matches one of the family's scouts is a scout, one
 * that matches a family adult is an adult, and any other new name is a sibling. Blank or repeated
 * names (all tickets under the buyer's name) are filled in with the family's scouts not counted
 * yet, then adults.
 */
export function splitTickets(names: (string | null | undefined)[], scouts: string[], adults: string[][]): Headcount {
  return splitTicketsDetail(names, scouts, adults).count;
}

/** splitTickets, plus which of the family's scouts (by position in `scouts`) were counted. */
export function splitTicketsDetail(
  names: (string | null | undefined)[],
  scouts: string[],
  adults: string[][],
): { count: Headcount; scoutIdx: number[] } {
  const out: Headcount = { scouts: 0, siblings: 0, adults: 0 };
  const scoutUsed = new Set<number>();
  const adultUsed = new Set<number>();
  const seen = new Set<string>();
  const distinct: string[] = [];
  let unknown = 0;
  for (const raw of names) {
    const n = norm(raw);
    if (!n || seen.has(n)) unknown++;
    else {
      seen.add(n);
      distinct.push(n);
    }
  }
  // Exact names first, so Charleigh doesn't take Charles's place; then nicknames.
  const left = new Set(distinct);
  for (const exact of [true, false]) {
    const match = (x: string, n: string) => (exact ? norm(x) === n : sameName(x, n));
    for (const n of distinct) {
      if (!left.has(n)) continue;
      const s = scouts.findIndex((x, i) => !scoutUsed.has(i) && match(x, n));
      if (s >= 0) {
        scoutUsed.add(s);
        out.scouts++;
        left.delete(n);
        continue;
      }
      const a = adults.findIndex((list, i) => !adultUsed.has(i) && list.some((x) => Boolean(x) && match(x, n)));
      if (a >= 0) {
        adultUsed.add(a);
        out.adults++;
        left.delete(n);
      }
    }
  }
  out.siblings = left.size;
  const moreScouts = Math.min(unknown, scouts.length - scoutUsed.size);
  for (let i = 0, added = 0; i < scouts.length && added < moreScouts; i++) {
    if (!scoutUsed.has(i)) {
      scoutUsed.add(i);
      added++;
    }
  }
  out.scouts += moreScouts;
  out.adults += unknown - moreScouts;
  return { count: out, scoutIdx: [...scoutUsed].sort((a, b) => a - b) };
}

/** The groups the camp kitchen counts people in (see 20261102000000_camp_kitchen.sql). */
export type EaterGroup =
  | "adult" | "lion" | "tiger" | "wolf" | "bear" | "webelos" | "aol" | "scout"
  | "sib_0_3" | "sib_4_6" | "sib_7_9" | "sib_10_12" | "sib_13_up" | "sib";
export type Eaters = Partial<Record<EaterGroup, number>>;

const RANKS = new Set(["lion", "tiger", "wolf", "bear", "webelos", "aol"]);

export function siblingGroup(age: number | null): EaterGroup {
  if (age === null || !Number.isFinite(age) || age < 0) return "sib";
  if (age <= 3) return "sib_0_3";
  if (age <= 6) return "sib_4_6";
  if (age <= 9) return "sib_7_9";
  if (age <= 12) return "sib_10_12";
  return "sib_13_up";
}

/**
 * Siblings' ages from a sign-up's answers: a question about siblings (or brothers or sisters) and
 * their age. "7 and 4", "Emma (7), Jack 3", "18 months" (0). Read in memory; only the age groups
 * are kept, as counts.
 */
export function siblingAges(answers: { question: string; answer: string }[]): number[] {
  const ages: number[] = [];
  for (const a of answers) {
    if (!/sibling|brother|sister/i.test(a.question) || !/\bages?\b|\bold\b|\bbirth/i.test(a.question)) continue;
    for (const m of a.answer.matchAll(/(\d{1,2})(?:\s*(?:-|to)\s*\d{1,2})?\s*(mo(?:nths?|s)?\b|m\b)?/gi)) {
      const n = Number(m[1]);
      if (m[2]) ages.push(0);
      else if (n <= 17) ages.push(n);
    }
  }
  return ages;
}

/**
 * Who a family is bringing, by group: adults; each scout counted by their den on the roster (a
 * scout who isn't on the roster is "scout"); siblings by the ages the sign-up gave, in order (the
 * rest "sib"). Groups with nobody are left out.
 */
export function eatersFor(count: Headcount, scoutRanks: (string | null)[], siblingAgeList: number[]): Eaters {
  const out: Eaters = {};
  const add = (g: EaterGroup, n = 1) => {
    if (n > 0) out[g] = (out[g] ?? 0) + n;
  };
  add("adult", count.adults);
  for (let i = 0; i < count.scouts; i++) {
    const r = scoutRanks[i];
    add(r && RANKS.has(r) ? (r as EaterGroup) : "scout");
  }
  for (let i = 0; i < count.siblings; i++) add(siblingGroup(siblingAgeList[i] ?? null));
  return out;
}

/**
 * How many people an order is for. Ticket lines count; a sign-up sold as items instead (the fall
 * campout's "Camping Fee for Kids Ages 4+ and Adults") counts its items, but only for a campaign
 * tied to an event, and never donations, tips or processing fees.
 */
export function placesInOrder(
  items: { type: string | null; description: string; quantity: number }[],
  forEvent: boolean,
): number {
  const sum = (list: typeof items) => list.reduce((n, i) => n + Math.max(0, Math.round(i.quantity)), 0);
  const tickets = sum(items.filter((i) => i.type === "ticket"));
  if (tickets > 0 || !forEvent) return tickets;
  return sum(items.filter((i) => i.type === "item" && !/processing|donat|\btip\b/i.test(i.description)));
}
