// Money helpers and labels for charges (what people owe the pack). Pure: safe in the browser.

export type ChargeKind = "dues" | "national" | "council" | "event" | "other";
export type ChargeStatus = "open" | "reported" | "paid" | "waived" | "canceled";
export type PaidVia = "paypal" | "cash" | "check" | "other";

export const CHARGE_KINDS: ChargeKind[] = ["dues", "national", "council", "event", "other"];
export const CHARGE_STATUSES: ChargeStatus[] = ["open", "reported", "paid", "waived", "canceled"];

export const KIND_LABEL: Record<ChargeKind, string> = {
  dues: "Pack dues",
  national: "Scouting America registration",
  council: "Council fee",
  event: "Event fee",
  other: "Other",
};

/** How a charge's status reads to a family. */
export const STATUS_LABEL: Record<ChargeStatus, string> = {
  open: "Due",
  reported: "Waiting for a leader to confirm",
  paid: "Paid",
  waived: "Waived",
  canceled: "Canceled",
};

/** Shorter labels for leaders' lists. */
export const STATUS_SHORT: Record<ChargeStatus, string> = {
  open: "Not paid",
  reported: "Family says paid",
  paid: "Paid",
  waived: "Waived",
  canceled: "Canceled",
};

export const STATUS_STYLE: Record<ChargeStatus, string> = {
  open: "bg-gold-50 text-gold-800",
  reported: "bg-surface text-navy",
  paid: "bg-mint text-pine",
  waived: "bg-surface text-muted",
  canceled: "bg-surface text-muted line-through",
};

export const PAID_VIA_LABEL: Record<PaidVia, string> = {
  paypal: "PayPal",
  cash: "Cash",
  check: "Check",
  other: "Other",
};

export interface ChargeRow {
  id: string;
  family_id: string | null;
  adult_id: string | null;
  scout_id: string | null;
  kind: ChargeKind;
  title: string;
  season: string | null;
  event_id: string | null;
  amount_cents: number;
  due_on: string | null;
  status: ChargeStatus;
  paid_via: PaidVia | null;
  paid_at: string | null;
  paid_amount_cents: number | null;
  note: string | null;
  report_note: string | null;
  remitted_on: string | null;
  created_at: string;
  scout?: { first_name: string; last_name?: string } | null;
  adult?: { first_name: string; preferred_name: string | null; last_name?: string } | null;
  family?: { family_name: string } | null;
}

/** Columns (and names) to select for a ChargeRow. */
export const CHARGE_COLUMNS =
  "id, family_id, adult_id, scout_id, kind, title, season, event_id, amount_cents, due_on, status, paid_via, paid_at, paid_amount_cents, note, report_note, remitted_on, created_at, scout:scouts(first_name, last_name), adult:adults!charges_adult_id_fkey(first_name, preferred_name, last_name), family:families(family_name)";

const whole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/** $12 or $12.50 */
export function fmtMoney(c: number | null | undefined): string {
  const n = Number(c ?? 0);
  return n % 100 === 0 ? whole.format(n / 100) : cents.format(n / 100);
}

/** "12", "12.50", "$1,000" -> cents; null when it isn't a dollar amount from $0 to $1,000. */
export function parseDollars(v: string): number | null {
  const s = v.replace(/[$,\s]/g, "");
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(s)) return null;
  const [d, f = ""] = s.split(".");
  const c = Number(d) * 100 + Number(f.padEnd(2, "0"));
  return c <= 100000 ? c : null;
}

/** Cents as a form value: "" for nothing, "12" or "12.50". */
export function centsToInput(c: number | null | undefined): string {
  if (c === null || c === undefined) return "";
  return c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2);
}

export interface EventFees {
  fee_family_cents?: number | null;
  fee_scout_cents?: number | null;
  fee_adult_cents?: number | null;
}

export function hasFee(e: EventFees): boolean {
  return e.fee_family_cents != null || e.fee_scout_cents != null || e.fee_adult_cents != null;
}

/** What an RSVP of `scouts` and `adults` costs (same formula as the database). */
export function eventCost(e: EventFees, scouts: number, adults: number): number {
  return Math.min((e.fee_family_cents ?? 0) + scouts * (e.fee_scout_cents ?? 0) + adults * (e.fee_adult_cents ?? 0), 100000);
}

/** "$10 per family + $25 per scout + $15 per adult" */
export function costLabel(e: EventFees): string {
  const parts: string[] = [];
  if (e.fee_family_cents != null) parts.push(`${fmtMoney(e.fee_family_cents)} per family`);
  if (e.fee_scout_cents != null) parts.push(`${fmtMoney(e.fee_scout_cents)} per scout`);
  if (e.fee_adult_cents != null) parts.push(`${fmtMoney(e.fee_adult_cents)} per adult`);
  return parts.length ? parts.join(" + ") : "Free";
}

/** "Sky" or "Alex" (who a charge is for), or null when it's for the whole family. */
export function chargeFor(c: Pick<ChargeRow, "scout" | "adult" | "scout_id" | "adult_id" | "family_id">): string | null {
  if (c.scout) return c.scout.first_name;
  if (c.adult && c.family_id) return c.adult.preferred_name || c.adult.first_name;
  return null;
}

/** Who owes it, for leaders: "Smith family" or "Lee Leader". */
export function ownerName(c: Pick<ChargeRow, "family" | "adult" | "family_id">): string {
  if (c.family_id) return `${c.family?.family_name ?? "Unknown"} family`;
  if (c.adult) return `${c.adult.preferred_name || c.adult.first_name} ${c.adult.last_name ?? ""}`.trim();
  return "Unknown";
}
