// "Big" pack events that get their own tab in the bottom bar in the weeks before they happen.
// Pure functions: used by the server (to pick the event) and the client (for the icon).

export type FeaturedKind = "campout" | "derby" | "space_derby" | "regatta" | "blue_gold" | "crossover";

const KINDS: { kind: FeaturedKind; label: string; match: (title: string, category: string) => boolean }[] = [
  { kind: "space_derby", label: "Derby", match: (t) => /space\s*derby|rocket/i.test(t) },
  { kind: "derby", label: "Derby", match: (t, c) => /derby/i.test(c) || /pinewood|derby/i.test(t) },
  { kind: "regatta", label: "Regatta", match: (t) => /regatta/i.test(t) },
  { kind: "blue_gold", label: "Blue & Gold", match: (t, c) => /blue\s*(&|and|n)\s*gold/i.test(`${t} ${c}`) },
  { kind: "crossover", label: "Crossover", match: (t) => /cross\s*over|bridging/i.test(t) },
  { kind: "campout", label: "Campout", match: (t, c) => c === "Campout" || /camp\s*out|camporee|overnight/i.test(t) },
];

export function featuredKind(e: { title: string; category: string }): { kind: FeaturedKind; label: string } | null {
  const k = KINDS.find((x) => x.match(e.title, e.category));
  return k ? { kind: k.kind, label: k.label } : null;
}

/** How long before an event its tab appears, and how long after it stays (for photos). */
export const FEATURE_DAYS_BEFORE = 45;
export const FEATURE_DAYS_AFTER = 3;

export interface FeaturedTab {
  href: string;
  label: string;
  kind: FeaturedKind;
}

export function eventPath(e: { id: string; category: string }) {
  return e.category === "Campout" ? `/campouts/${e.id}` : `/events/${e.id}`;
}
