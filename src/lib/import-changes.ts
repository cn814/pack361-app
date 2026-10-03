// What a Scoutbook advancement import changed, as recorded by import_scout_advancement().

export interface ImportChanges {
  new: number;
  changed: number;
  removed: number;
  new_by_kind?: Partial<Record<"rank" | "adventure" | "requirement" | "award", number>>;
}

const KIND_WORDS: [keyof NonNullable<ImportChanges["new_by_kind"]>, string, string][] = [
  ["rank", "rank", "ranks"],
  ["adventure", "adventure", "adventures"],
  ["requirement", "requirement", "requirements"],
  ["award", "award", "awards"],
];

const n = (x: number) => x.toLocaleString("en-US");

/** "12 new (2 ranks, 10 requirements), 3 updated, 1 no longer in Scoutbook", or "No changes since the last import". */
export function changesText(c: ImportChanges | null | undefined): string | null {
  if (!c) return null;
  if (!c.new && !c.changed && !c.removed) return "No changes since the last import.";
  const parts: string[] = [];
  if (c.new) {
    const kinds = KIND_WORDS.filter(([k]) => c.new_by_kind?.[k]).map(([k, one, many]) => {
      const v = c.new_by_kind![k]!;
      return `${n(v)} ${v === 1 ? one : many}`;
    });
    parts.push(`${n(c.new)} new${kinds.length ? ` (${kinds.join(", ")})` : ""}`);
  }
  if (c.changed) parts.push(`${n(c.changed)} updated (dates, approved or awarded)`);
  if (c.removed) parts.push(`${n(c.removed)} no longer in Scoutbook`);
  const total = c.new + c.changed + c.removed;
  return `${n(total)} change${total === 1 ? "" : "s"}: ${parts.join(", ")}.`;
}
