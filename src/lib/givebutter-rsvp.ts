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
  out.scouts += moreScouts;
  out.adults += unknown - moreScouts;
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
