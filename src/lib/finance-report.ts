import "server-only";
import { createClient } from "./supabase/server";
import { getAllCharges } from "./money-data";
import { KIND_LABEL, ownerName, chargeFor, type ChargeKind } from "./money";
import { PAID as GIVEBUTTER_PAID } from "./givebutter";
import { getBudget, getCategories, getExpenses, getIncome } from "./finance-data";
import {
  PAID_VIA_LABEL as EXPENSE_PAID_VIA,
  RECEIVED_VIA_LABEL,
  expenseWho,
  seasonRange,
  type ExpenseRow,
  type FinanceCategory,
  type IncomeSource,
} from "./finance";
import { PAID_VIA_LABEL as CHARGE_PAID_VIA } from "./money";
import { easternDate, startOfEasternDay } from "./tz";

// The pack's financial report for a period: every dollar in and out, by category, month,
// event and den, against the budget. Built from:
//   money in : charges paid to the pack (not through Givebutter), Givebutter orders, and
//              hand-entered income;
//   money out: expenses leadership approved or paid (by the date on the receipt).
// Requests still waiting for review and declined ones aren't counted.

export interface Txn {
  date: string;
  dir: "in" | "out";
  categoryId: string | null;
  category: string;
  description: string;
  who: string;
  method: string;
  amountCents: number;
  status: string;
  reference: string;
  eventId: string | null;
  event: string;
  den: string;
  source: "charge" | "givebutter" | "income" | "expense";
}

export interface CategoryLine {
  id: string | null;
  name: string;
  actual: number;
  budget: number | null;
  parts: { label: string; cents: number }[];
}

export interface FinanceReport {
  from: string;
  to: string;
  season: string | null;
  hasBudget: boolean;
  income: number;
  expenses: number;
  incomeLines: CategoryLine[];
  expenseLines: CategoryLine[];
  budgetIncome: number;
  budgetExpenses: number;
  byMethod: { label: string; cents: number }[];
  byMonth: { month: string; income: number; expenses: number }[];
  byEvent: { id: string; title: string; date: string; income: number; expenses: number }[];
  byDen: { name: string; expenses: number }[];
  owedToMembers: { cents: number; count: number };
  waitingReview: { cents: number; count: number };
  owedToPack: { cents: number; count: number };
  txns: Txn[];
}

const CHARGE_SOURCE: Record<ChargeKind, IncomeSource> = {
  dues: "dues",
  event: "event",
  national: "registration",
  council: "registration",
  other: "other_charges",
};

const inRange = (d: string, from: string, to: string) => d >= from && d <= to;

/** The day after `date` (YYYY-MM-DD). */
function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

interface GbOrder {
  id: number;
  campaign_id: number;
  name: string | null;
  amount: number | null;
  status: string | null;
  created_at: string | null;
  campaign: { title: string; event_id: string | null; event: { title: string; starts_at: string } | null } | null;
}

async function getGivebutterOrders(from: string, to: string): Promise<GbOrder[]> {
  const supabase = await createClient();
  const out: GbOrder[] = [];
  for (let page = 0; page < 20; page++) {
    const { data, error } = await supabase
      .from("givebutter_orders")
      .select("id, campaign_id, name, amount, status, created_at, campaign:givebutter_campaigns(title, event_id, event:events(title, starts_at))")
      .gte("created_at", startOfEasternDay(from))
      .lt("created_at", startOfEasternDay(nextDay(to)))
      .order("created_at")
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as unknown as GbOrder[]));
    if (!data || data.length < 1000) break;
  }
  return out.filter((o) => !o.status || GIVEBUTTER_PAID.has(o.status.toLowerCase()));
}

export async function buildFinanceReport(opts: { from: string; to: string; season: string | null; duesCampaignId: string }): Promise<FinanceReport> {
  const { from, to } = opts;
  const full = opts.season ? seasonRange(opts.season) : null;
  const season = full && full.from === from && full.to === to ? opts.season : null;

  const [categories, charges, orders, income, expenses, waiting, budget] = await Promise.all([
    getCategories({ withArchived: true }),
    getAllCharges(),
    getGivebutterOrders(from, to),
    getIncome({ from, to }),
    getExpenses({ from, to, status: ["approved", "paid"] }),
    getExpenses({ status: ["submitted", "approved"] }),
    season ? getBudget(season) : Promise.resolve(new Map<string, number>()),
  ]);

  const bySource = new Map<IncomeSource, FinanceCategory>();
  for (const c of categories) if (c.source) bySource.set(c.source, c);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const txns: Txn[] = [];

  // Charges paid to the pack directly (PayPal, check, cash). Givebutter payments are counted
  // from the Givebutter orders instead, so they aren't counted twice.
  for (const c of charges) {
    if (c.status !== "paid" || c.paid_via === "givebutter") continue;
    const date = easternDate(c.paid_at ?? c.created_at);
    if (!inRange(date, from, to)) continue;
    const cat = bySource.get(CHARGE_SOURCE[c.kind]);
    const forWho = chargeFor(c);
    txns.push({
      date,
      dir: "in",
      categoryId: cat?.id ?? null,
      category: cat?.name ?? KIND_LABEL[c.kind],
      description: c.title,
      who: `${ownerName(c)}${forWho ? ` (${forWho})` : ""}`,
      method: c.paid_via ? CHARGE_PAID_VIA[c.paid_via] : "",
      amountCents: c.paid_amount_cents ?? c.amount_cents,
      status: "received",
      reference: c.paypal_capture_id ?? "",
      eventId: c.event_id,
      event: c.event?.title ?? "",
      den: "",
      source: "charge",
    });
  }

  // Givebutter: the dues campaign counts as pack dues; everything else as fundraisers and donations.
  for (const o of orders) {
    const cents = Math.round(Number(o.amount ?? 0) * 100);
    if (cents <= 0 || !o.created_at) continue;
    const dues = String(o.campaign_id) === opts.duesCampaignId;
    const cat = bySource.get(dues ? "dues" : "givebutter");
    txns.push({
      date: easternDate(o.created_at),
      dir: "in",
      categoryId: cat?.id ?? null,
      category: cat?.name ?? "Givebutter",
      description: o.campaign?.title ?? `Givebutter campaign ${o.campaign_id}`,
      who: o.name ?? "",
      method: "Givebutter",
      amountCents: cents,
      status: "received",
      reference: String(o.id),
      eventId: o.campaign?.event_id ?? null,
      event: o.campaign?.event?.title ?? "",
      den: "",
      source: "givebutter",
    });
  }

  for (const r of income) {
    txns.push({
      date: r.received_on,
      dir: "in",
      categoryId: r.category_id,
      category: r.category?.name ?? catName.get(r.category_id) ?? "Other income",
      description: r.description,
      who: "",
      method: r.received_via ? RECEIVED_VIA_LABEL[r.received_via] : "",
      amountCents: r.amount_cents,
      status: "received",
      reference: r.reference ?? "",
      eventId: null,
      event: "",
      den: "",
      source: "income",
    });
  }

  for (const e of expenses) {
    txns.push({
      date: e.spent_on,
      dir: "out",
      categoryId: e.category_id,
      category: e.category?.name ?? (e.category_id ? (catName.get(e.category_id) ?? "") : "No category"),
      description: `${e.description}${e.vendor ? ` (${e.vendor})` : ""}`,
      who: expenseWho(e),
      method: e.paid_via ? EXPENSE_PAID_VIA[e.paid_via] : e.status === "approved" ? "Not paid back yet" : "",
      amountCents: e.amount_cents,
      status: e.status === "paid" ? (e.paid_by === "pack" ? "paid" : "paid back") : "owed",
      reference: e.paid_ref ?? "",
      eventId: e.event_id,
      event: e.event?.title ?? "",
      den: e.den?.name ?? "",
      source: "expense",
    });
  }

  txns.sort((a, b) => a.date.localeCompare(b.date) || (a.dir === b.dir ? 0 : a.dir === "in" ? -1 : 1) || a.category.localeCompare(b.category));

  // Category lines, in category order, with the budget alongside.
  const lines = (dir: "in" | "out"): CategoryLine[] => {
    const kind = dir === "in" ? "income" : "expense";
    const list: CategoryLine[] = [];
    for (const c of categories.filter((x) => x.kind === kind)) {
      const mine = txns.filter((t) => t.dir === dir && t.categoryId === c.id);
      const actual = mine.reduce((s, t) => s + t.amountCents, 0);
      const b = budget.get(c.id) ?? null;
      if (!actual && b === null) continue;
      // Break app-counted income down by how it came in; Givebutter fundraisers by campaign.
      const parts = new Map<string, number>();
      for (const t of mine) {
        const key = c.source === "givebutter" ? t.description : c.source ? t.method || "Other" : "";
        if (key) parts.set(key, (parts.get(key) ?? 0) + t.amountCents);
      }
      list.push({
        id: c.id,
        name: c.name,
        actual,
        budget: b,
        parts: parts.size > 1 || c.source === "givebutter" ? [...parts].map(([label, cents]) => ({ label, cents })).sort((x, y) => y.cents - x.cents) : [],
      });
    }
    const loose = txns.filter((t) => t.dir === dir && !t.categoryId);
    if (loose.length) list.push({ id: null, name: "No category", actual: loose.reduce((s, t) => s + t.amountCents, 0), budget: null, parts: [] });
    return list;
  };
  const incomeLines = lines("in");
  const expenseLines = lines("out");

  const sum = (dir: "in" | "out") => txns.filter((t) => t.dir === dir).reduce((s, t) => s + t.amountCents, 0);

  const methods = new Map<string, number>();
  for (const t of txns) if (t.dir === "in") methods.set(t.method || "Other", (methods.get(t.method || "Other") ?? 0) + t.amountCents);

  const months = new Map<string, { income: number; expenses: number }>();
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); ) {
    months.set(m, { income: 0, expenses: 0 });
    const [y, mo] = m.split("-").map(Number);
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
    if (months.size > 240) break;
  }
  for (const t of txns) {
    const row = months.get(t.date.slice(0, 7));
    if (row) row[t.dir === "in" ? "income" : "expenses"] += t.amountCents;
  }

  const events = new Map<string, { id: string; title: string; date: string; income: number; expenses: number }>();
  const eventDates = new Map<string, string>();
  for (const e of expenses) if (e.event_id && e.event) eventDates.set(e.event_id, easternDate(e.event.starts_at));
  for (const o of orders) if (o.campaign?.event_id && o.campaign.event) eventDates.set(o.campaign.event_id, easternDate(o.campaign.event.starts_at));
  for (const t of txns) {
    if (!t.eventId) continue;
    const row = events.get(t.eventId) ?? { id: t.eventId, title: t.event || "Event", date: eventDates.get(t.eventId) ?? "", income: 0, expenses: 0 };
    row[t.dir === "in" ? "income" : "expenses"] += t.amountCents;
    events.set(t.eventId, row);
  }

  const dens = new Map<string, number>();
  for (const t of txns) if (t.dir === "out" && t.den) dens.set(t.den, (dens.get(t.den) ?? 0) + t.amountCents);

  // Approved but not paid back, for this period (it's already counted in money out).
  const owed = expenses.filter((e: ExpenseRow) => e.status === "approved");
  const review = waiting.filter((e: ExpenseRow) => e.status === "submitted");
  const unpaid = charges.filter((c) => (c.status === "open" || c.status === "reported") && inRange(c.due_on ?? easternDate(c.created_at), from, to));

  return {
    from,
    to,
    season,
    hasBudget: budget.size > 0,
    income: sum("in"),
    expenses: sum("out"),
    incomeLines,
    expenseLines,
    budgetIncome: incomeLines.reduce((s, l) => s + (l.budget ?? 0), 0),
    budgetExpenses: expenseLines.reduce((s, l) => s + (l.budget ?? 0), 0),
    byMethod: [...methods].map(([label, cents]) => ({ label, cents })).sort((a, b) => b.cents - a.cents),
    byMonth: [...months].map(([month, v]) => ({ month, ...v })),
    byEvent: [...events.values()].sort((a, b) => (a.date || "9").localeCompare(b.date || "9") || a.title.localeCompare(b.title)),
    byDen: [...dens].map(([name, expenses]) => ({ name, expenses })).sort((a, b) => b.expenses - a.expenses),
    owedToMembers: { cents: owed.reduce((s, e) => s + e.amount_cents, 0), count: owed.length },
    waitingReview: { cents: review.reduce((s, e) => s + e.amount_cents, 0), count: review.length },
    owedToPack: { cents: unpaid.reduce((s, c) => s + c.amount_cents, 0), count: unpaid.length },
    txns,
  };
}
