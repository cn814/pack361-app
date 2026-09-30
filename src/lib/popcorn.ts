// Trail's End sales export parsing (pure, testable).
import { parseCsv } from "./advancement";

export interface PopcornRow {
  name: string;
  amount: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/**
 * Trail's End exports differ by report, so find the columns by name:
 * a scout name ("Scout", "Scout Name", or First + Last) and a sales total ("Total Sales", "Total", "Sales").
 */
export function parseTrailsEnd(text: string): { rows: PopcornRow[]; nameCol: string; amountCol: string } {
  const table = parseCsv(text.replace(/^﻿/, ""));
  // Some reports put a title line or two above the header: use the first row that has a sales-looking column.
  const headerIdx = table.findIndex((r) => {
    const salesCol = r.findIndex((h) => /sales|sold|total|amount/i.test(h));
    const nameCol = r.findIndex((h, i) => i !== salesCol && /name|scout|first/i.test(h));
    return r.length >= 2 && salesCol >= 0 && nameCol >= 0;
  });
  if (headerIdx < 0) throw new Error("Couldn't find a scout name column and a sales column in that file.");
  const header = table[headerIdx].map((h) => h.trim());
  const lower = header.map((h) => h.toLowerCase());
  const find = (...tests: ((h: string) => boolean)[]) => {
    for (const t of tests) {
      const i = lower.findIndex(t);
      if (i >= 0) return i;
    }
    return -1;
  };
  const first = find((h) => h === "first name" || h === "scout first name", (h) => h.includes("first"));
  const last = find((h) => h === "last name" || h === "scout last name", (h) => h.includes("last"));
  const full = find((h) => h === "scout" || h === "scout name" || h === "name", (h) => h.includes("scout") && h.includes("name"));
  const amount = find(
    (h) => h === "total sales" || h === "total sold" || h === "total $",
    (h) => h.includes("total") && (h.includes("sale") || h.includes("sold") || h.includes("$")),
    (h) => h === "total" || h === "sales" || h === "amount",
    (h) => h.includes("sales"),
  );
  if (amount < 0 || (full < 0 && (first < 0 || last < 0))) {
    throw new Error("Couldn't find a scout name column and a sales column in that file.");
  }
  const rows: PopcornRow[] = [];
  for (const r of table.slice(headerIdx + 1)) {
    const name = full >= 0 && (first < 0 || last < 0) ? (r[full] ?? "").trim() : `${(r[first] ?? "").trim()} ${(r[last] ?? "").trim()}`.trim();
    const amt = Number((r[amount] ?? "").replace(/[$,\s]/g, ""));
    if (!name || /^total/i.test(name) || !isFinite(amt)) continue;
    rows.push({ name, amount: amt });
  }
  return { rows, nameCol: full >= 0 && (first < 0 || last < 0) ? header[full] : `${header[first]} + ${header[last]}`, amountCol: header[amount] };
}

/** Match "Cory Nealen" or "Nealen, Cory" to a roster scout. */
export function matchScout<T extends { id: string; first_name: string; last_name: string }>(name: string, scouts: T[]): T | null {
  let n = name;
  if (n.includes(",")) {
    const [l, f] = n.split(",", 2);
    n = `${f} ${l}`;
  }
  const key = norm(n);
  const exact = scouts.find((s) => norm(`${s.first_name}${s.last_name}`) === key);
  if (exact) return exact;
  const parts = n.trim().split(/\s+/);
  if (parts.length >= 2) {
    const f = norm(parts[0]);
    const l = norm(parts[parts.length - 1]);
    const hits = scouts.filter((s) => norm(s.last_name) === l && (norm(s.first_name).startsWith(f) || f.startsWith(norm(s.first_name))));
    if (hits.length === 1) return hits[0];
  }
  return null;
}
