// Pack finances: labels and rules for expenses, reimbursement requests, other income and
// receipts. Pure: safe in the browser. The database enforces the same rules (see the
// 20261004000000_finance migration).

export type ExpenseStatus = "submitted" | "approved" | "paid" | "declined";
export type ExpensePaidBy = "pack" | "member";
export type PayMeBy = "check" | "cash" | "paypal" | "zelle" | "venmo" | "other";
export type PaidVia = "check" | "cash" | "paypal" | "zelle" | "venmo" | "card" | "transfer" | "other";
export type ReceivedVia = "check" | "cash" | "deposit" | "paypal" | "givebutter" | "other";
export type IncomeSource = "dues" | "event" | "registration" | "other_charges" | "givebutter";

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  submitted: "Waiting for review",
  approved: "Approved, not paid yet",
  paid: "Paid",
  declined: "Declined",
};

export const EXPENSE_STATUS_STYLE: Record<ExpenseStatus, string> = {
  submitted: "bg-gold-50 text-gold-800",
  approved: "bg-surface text-navy",
  paid: "bg-mint text-pine",
  declined: "bg-surface text-muted",
};

export const PAY_ME_BY_LABEL: Record<PayMeBy, string> = {
  check: "Check",
  cash: "Cash",
  paypal: "PayPal",
  zelle: "Zelle",
  venmo: "Venmo",
  other: "Something else (say in the note)",
};

export const PAID_VIA_LABEL: Record<PaidVia, string> = {
  check: "Check",
  cash: "Cash",
  paypal: "PayPal",
  zelle: "Zelle",
  venmo: "Venmo",
  card: "Pack debit or credit card",
  transfer: "Bank transfer",
  other: "Other",
};

export const RECEIVED_VIA_LABEL: Record<ReceivedVia, string> = {
  check: "Check",
  cash: "Cash",
  deposit: "Bank deposit",
  paypal: "PayPal",
  givebutter: "Givebutter",
  other: "Other",
};

export interface FinanceCategory {
  id: string;
  kind: "income" | "expense";
  name: string;
  source: IncomeSource | null;
  sort: number;
  archived_at: string | null;
}

export const CATEGORY_COLUMNS = "id, kind, name, source, sort, archived_at";

export interface ExpenseRow {
  id: string;
  spent_on: string;
  amount_cents: number;
  category_id: string | null;
  description: string;
  vendor: string | null;
  event_id: string | null;
  den_id: string | null;
  paid_by: ExpensePaidBy;
  adult_id: string | null;
  status: ExpenseStatus;
  pay_me_by: PayMeBy | null;
  note: string | null;
  receipt_path: string | null;
  receipt_name: string | null;
  receipt_mime: string | null;
  review_note: string | null;
  approved_by: string | null;
  approved_at: string | null;
  paid_via: PaidVia | null;
  paid_on: string | null;
  paid_ref: string | null;
  created_at: string;
  event?: { title: string; starts_at: string } | null;
  den?: { name: string } | null;
  adult?: { first_name: string; preferred_name: string | null; last_name: string } | null;
  category?: { name: string } | null;
}

export const EXPENSE_COLUMNS =
  "id, spent_on, amount_cents, category_id, description, vendor, event_id, den_id, paid_by, adult_id, status, pay_me_by, note, receipt_path, receipt_name, receipt_mime, review_note, approved_by, approved_at, paid_via, paid_on, paid_ref, created_at, event:events(title, starts_at), den:dens(name), adult:adults!expenses_adult_id_fkey(first_name, preferred_name, last_name), category:finance_categories(name)";

export interface IncomeRow {
  id: string;
  received_on: string;
  amount_cents: number;
  category_id: string;
  description: string;
  received_via: ReceivedVia | null;
  reference: string | null;
  note: string | null;
  created_at: string;
  category?: { name: string } | null;
}

export const INCOME_COLUMNS = "id, received_on, amount_cents, category_id, description, received_via, reference, note, created_at, category:finance_categories(name)";

/** "Alex Smith" for who is owed, or "The pack" for pack spending. */
export function expenseWho(e: Pick<ExpenseRow, "paid_by" | "adult">): string {
  if (e.paid_by === "pack") return "Paid by the pack";
  if (!e.adult) return "Someone no longer on the roster";
  return `${e.adult.preferred_name || e.adult.first_name} ${e.adult.last_name}`.trim();
}

/** Ask for receipts within this many days (the pack's rule). */
export const RECEIPT_DAYS = 30;

/** Money amounts for finance entries: up to $100,000. */
export function parseAmount(v: string): number | null {
  const s = v.replace(/[$,\s]/g, "");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return null;
  const [d, f = ""] = s.split(".");
  const c = Number(d) * 100 + Number(f.padEnd(2, "0"));
  return c >= 1 && c <= 10000000 ? c : null;
}

/** "2026-27" for a date in that season (July 1 to June 30). */
export function seasonOf(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const start = m >= 7 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** July 1 to June 30 for a season like "2026-27". */
export function seasonRange(season: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(season);
  if (!m) return null;
  const y = Number(m[1]);
  if (String((y + 1) % 100).padStart(2, "0") !== m[2]) return null;
  return { from: `${y}-07-01`, to: `${y + 1}-06-30` };
}

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------
export const RECEIPTS_BUCKET = "receipts";
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

export const RECEIPT_TYPES: Record<string, { mime: string; ext: string }> = {
  pdf: { mime: "application/pdf", ext: "pdf" },
  jpg: { mime: "image/jpeg", ext: "jpg" },
  jpeg: { mime: "image/jpeg", ext: "jpg" },
  png: { mime: "image/png", ext: "png" },
  webp: { mime: "image/webp", ext: "webp" },
};

export const RECEIPT_ACCEPT = "image/*,.pdf,application/pdf";
export const RECEIPT_HELP = "A photo or PDF of the receipt, up to 10 MB.";

export function receiptExt(name: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : "";
}

/** The type a receipt is stored as, or null when it isn't allowed. */
export function receiptTypeFor(name: string): { mime: string; ext: string } | null {
  return RECEIPT_TYPES[receiptExt(name)] ?? null;
}

/** Problem with a picked receipt, in plain words, or null if it's fine. */
export function checkReceipt(name: string, size: number): string | null {
  if (!receiptTypeFor(name)) return `That kind of file can't be added. Use ${RECEIPT_HELP}`;
  if (size <= 0) return "That file is empty.";
  if (size > MAX_RECEIPT_BYTES) return "That file is over 10 MB. Take a closer photo of just the receipt, or save a smaller PDF.";
  return null;
}

/**
 * The period a report covers: a whole season (July to June), or any from/to dates (up to
 * five years). Falls back to the current season.
 */
export function resolvePeriod(
  p: { season?: string; from?: string; to?: string },
  currentSeason: string,
): { from: string; to: string; season: string | null; label: string } {
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (p.from && p.to && date.test(p.from) && date.test(p.to) && p.from <= p.to) {
    const years = Number(p.to.slice(0, 4)) - Number(p.from.slice(0, 4));
    if (years <= 5) {
      const s = seasonOf(p.from);
      const r = seasonRange(s)!;
      const whole = r.from === p.from && r.to === p.to;
      return { from: p.from, to: p.to, season: whole ? s : null, label: whole ? `Season ${s}` : `${p.from} to ${p.to}` };
    }
  }
  const season = p.season && seasonRange(p.season) ? p.season : currentSeason;
  const r = seasonRange(season) ?? seasonRange(seasonOf(new Date().toISOString().slice(0, 10)))!;
  return { from: r.from, to: r.to, season, label: `Season ${season} (July ${r.from.slice(0, 4)} to June ${r.to.slice(0, 4)})` };
}
