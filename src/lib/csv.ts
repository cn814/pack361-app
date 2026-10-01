// Spreadsheet (CSV) helpers for leaders' downloads.

/** Quote a cell; a leading = + - @ is neutralised so a spreadsheet won't run it as a formula. */
export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows to CSV text with a byte-order mark so Excel reads accents correctly. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Cents as 12.50 (blank for null). */
export const csvDollars = (c: number | null | undefined) => (c === null || c === undefined ? "" : (c / 100).toFixed(2));
