import "server-only";
import { createClient } from "./supabase/server";
import { CATEGORY_COLUMNS, EXPENSE_COLUMNS, INCOME_COLUMNS, type ExpenseRow, type FinanceCategory, type IncomeRow } from "./finance";
import { easternDate } from "./tz";

/** Budget categories, in order. Members can read them; archived ones only when asked. */
export async function getCategories(opts: { kind?: "income" | "expense"; withArchived?: boolean } = {}): Promise<FinanceCategory[]> {
  const supabase = await createClient();
  let q = supabase.from("finance_categories").select(CATEGORY_COLUMNS).order("kind").order("sort").order("name");
  if (opts.kind) q = q.eq("kind", opts.kind);
  if (!opts.withArchived) q = q.is("archived_at", null);
  const { data } = await q;
  return (data ?? []) as FinanceCategory[];
}

/** Events an expense might be for: the last six months and the next two. */
export async function getExpenseEvents(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const from = new Date(Date.now() - 183 * 86400000).toISOString();
  const to = new Date(Date.now() + 62 * 86400000).toISOString();
  const { data } = await supabase
    .from("events")
    .select("id, title, starts_at")
    .gte("starts_at", from)
    .lte("starts_at", to)
    .order("starts_at", { ascending: false })
    .limit(200);
  return ((data ?? []) as { id: string; title: string; starts_at: string }[]).map((e) => {
    const d = new Date(e.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
    return { id: e.id, name: `${e.title} (${d})` };
  });
}

/** Expenses (leadership sees all; anyone else only their own), newest first. */
export async function getExpenses(opts: { from?: string; to?: string; status?: string[]; adultId?: string; limit?: number } = {}): Promise<ExpenseRow[]> {
  const supabase = await createClient();
  const out: ExpenseRow[] = [];
  for (let page = 0; page < 20; page++) {
    let q = supabase.from("expenses").select(EXPENSE_COLUMNS);
    if (opts.from) q = q.gte("spent_on", opts.from);
    if (opts.to) q = q.lte("spent_on", opts.to);
    if (opts.status?.length) q = q.in("status", opts.status);
    if (opts.adultId) q = q.eq("adult_id", opts.adultId);
    const size = Math.min(opts.limit ?? 1000, 1000);
    const { data, error } = await q
      .order("spent_on", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(page * size, page * size + size - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as unknown as ExpenseRow[]));
    if (!data || data.length < size || (opts.limit && out.length >= opts.limit)) break;
  }
  return opts.limit ? out.slice(0, opts.limit) : out;
}

export async function getExpense(id: string): Promise<ExpenseRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("expenses").select(EXPENSE_COLUMNS).eq("id", id).maybeSingle();
  return (data as unknown as ExpenseRow | null) ?? null;
}

/** Hand-entered income (leadership only), newest first. */
export async function getIncome(opts: { from?: string; to?: string } = {}): Promise<IncomeRow[]> {
  const supabase = await createClient();
  let q = supabase.from("finance_income").select(INCOME_COLUMNS);
  if (opts.from) q = q.gte("received_on", opts.from);
  if (opts.to) q = q.lte("received_on", opts.to);
  const { data } = await q.order("received_on", { ascending: false }).order("created_at", { ascending: false }).limit(2000);
  return (data ?? []) as unknown as IncomeRow[];
}

/** The budget for a season: category id -> cents. */
export async function getBudget(season: string): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.from("finance_budget").select("category_id, amount_cents").eq("season", season);
  return new Map(((data ?? []) as { category_id: string; amount_cents: number }[]).map((b) => [b.category_id, b.amount_cents]));
}

/** Requests waiting on leadership (for the badge on Leaders and Money). */
export async function countWaitingRequests(): Promise<{ toReview: number; toPay: number }> {
  const supabase = await createClient();
  const [a, b] = await Promise.all([
    supabase.from("expenses").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("expenses").select("id", { count: "exact", head: true }).eq("status", "approved"),
  ]);
  return { toReview: a.count ?? 0, toPay: b.count ?? 0 };
}

/** Seasons that have any finance data, newest first, always including the current one. */
export async function getFinanceSeasons(current: string): Promise<string[]> {
  const supabase = await createClient();
  const [{ data: e }, { data: i }, { data: b }] = await Promise.all([
    supabase.from("expenses").select("spent_on").order("spent_on").limit(1),
    supabase.from("finance_income").select("received_on").order("received_on").limit(1),
    supabase.from("finance_budget").select("season"),
  ]);
  const set = new Set<string>([current]);
  const first = [e?.[0]?.spent_on, i?.[0]?.received_on].filter(Boolean).sort()[0] as string | undefined;
  const startYear = first ? Number(first.slice(0, 4)) - (Number(first.slice(5, 7)) >= 7 ? 0 : 1) : Number(current.slice(0, 4));
  const today = easternDate(Date.now());
  const endYear = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) >= 7 ? 0 : 1);
  for (let y = Math.max(startYear, endYear - 10); y <= endYear; y++) set.add(`${y}-${String((y + 1) % 100).padStart(2, "0")}`);
  for (const r of (b ?? []) as { season: string }[]) set.add(r.season);
  return [...set].sort().reverse();
}
