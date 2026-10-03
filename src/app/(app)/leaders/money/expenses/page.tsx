import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, CircleCheck, Clock, Paperclip, Plus } from "lucide-react";
import ActionForm, { Field } from "@/components/ActionForm";
import BackLink from "@/components/BackLink";
import ExpenseReview from "@/components/ExpenseReview";
import SubmitButton from "@/components/SubmitButton";
import { isCommittee, requireMember } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { getBudget, getCategories, getExpenses, getFinanceSeasons, getIncome } from "@/lib/finance-data";
import {
  EXPENSE_STATUS_LABEL,
  EXPENSE_STATUS_STYLE,
  PAID_VIA_LABEL,
  PAY_ME_BY_LABEL,
  RECEIPT_DAYS,
  RECEIVED_VIA_LABEL,
  expenseWho,
  seasonRange,
  type ExpenseRow,
  type FinanceCategory,
  type ReceivedVia,
} from "@/lib/finance";
import { centsToInput, fmtMoney } from "@/lib/money";
import { fmtShortDate } from "@/lib/advancement";
import { daysBetween, easternDate } from "@/lib/tz";
import { todayEastern } from "@/lib/money-data";
import { deleteExpense, deleteIncome, saveBudget, saveCategory, saveIncome, toggleCategory } from "./actions";

export const metadata: Metadata = { title: "Expenses" };

const TABS = { review: "To review", expenses: "Expenses", income: "Other income", budget: "Budget" } as const;
type Tab = keyof typeof TABS;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ExpensesPage({ searchParams }: PageProps<"/leaders/money/expenses">) {
  const me = await requireMember();
  if (!isCommittee(me)) redirect("/leaders");
  const sp = await searchParams;
  const tab: Tab = one(sp.tab) in TABS ? (one(sp.tab) as Tab) : "review";
  const note = one(sp.note).slice(0, 120);
  const settings = await getSettings();
  const seasons = await getFinanceSeasons(settings.dues_season);
  const season = seasonRange(one(sp.season)) ? one(sp.season) : settings.dues_season;
  if (!seasons.includes(season)) seasons.unshift(season);
  const [waiting, categories] = await Promise.all([getExpenses({ status: ["submitted", "approved"] }), getCategories({ withArchived: true })]);
  const toReview = waiting.filter((e) => e.status === "submitted");
  const toPay = waiting.filter((e) => e.status === "approved");
  const today = todayEastern();

  return (
    <>
      <BackLink href="/leaders/money" label="Money" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Expenses and reimbursements</h1>
      <p className="-mt-1 text-sm text-muted">What the pack spends, who needs paying back, other money in, and the budget.</p>

      {note && (
        <p className="flex items-center gap-1.5 rounded-xl bg-mint p-3 text-sm font-semibold text-pine">
          <CircleCheck className="h-4 w-4 shrink-0" aria-hidden /> {note}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Link href="/leaders/money/expenses/new" className="btn-primary py-2">
          <Plus className="h-4 w-4" aria-hidden /> Record an expense
        </Link>
        <Link href="/leaders/money/reports" className="btn-ghost py-2">
          <BarChart3 className="h-4 w-4" aria-hidden /> Reports
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 text-sm font-semibold" role="tablist">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Link
            key={t}
            href={`/leaders/money/expenses?tab=${t}`}
            role="tab"
            aria-selected={tab === t}
            className={`rounded-full px-3 py-1.5 ${tab === t ? "bg-brand text-white" : "border border-line bg-card text-navy"}`}
          >
            {TABS[t]}
            {t === "review" && waiting.length > 0 ? ` (${waiting.length})` : ""}
          </Link>
        ))}
      </div>

      {tab === "review" && <ReviewTab toReview={toReview} toPay={toPay} categories={categories} meId={me.id} today={today} />}
      {tab === "expenses" && <ExpensesTab season={season} seasons={seasons} categories={categories} sp={sp} />}
      {tab === "income" && <IncomeTab season={season} seasons={seasons} categories={categories} today={today} />}
      {tab === "budget" && <BudgetTab season={season} seasons={seasons} categories={categories} />}
    </>
  );
}

function SeasonPicker({ tab, season, seasons, extra }: { tab: Tab; season: string; seasons: string[]; extra?: React.ReactNode }) {
  return (
    <Form action="/leaders/money/expenses" className="card flex flex-wrap items-end gap-2">
      <input type="hidden" name="tab" value={tab} />
      <label className="block min-w-28 flex-1 space-y-1">
        <span className="text-xs font-bold text-navy">Season (July to June)</span>
        <select className="input py-2" name="season" defaultValue={season}>
          {seasons.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      {extra}
      <button className="btn-ghost py-2">Show</button>
    </Form>
  );
}

// ---------------------------------------------------------------------------
// To review: requests waiting for approval, and approved ones waiting to be paid back
// ---------------------------------------------------------------------------
function ReviewTab({
  toReview,
  toPay,
  categories,
  meId,
  today,
}: {
  toReview: ExpenseRow[];
  toPay: ExpenseRow[];
  categories: FinanceCategory[];
  meId: string;
  today: string;
}) {
  const options = categories.filter((c) => c.kind === "expense" && !c.archived_at).map((c) => ({ id: c.id, name: c.name }));
  const owed = toPay.reduce((s, e) => s + e.amount_cents, 0);
  return (
    <>
      <section className="space-y-2">
        <h2 className="section-title px-1">Waiting for review ({toReview.length})</h2>
        {toReview.length === 0 ? (
          <p className="card text-sm text-muted">Nothing waiting. Members send requests from Leaders → Get paid back.</p>
        ) : (
          <ul className="space-y-2">
            {toReview.map((e) => (
              <ExpenseCard key={e.id} e={e}>
                <ExpenseReview
                  id={e.id}
                  status="submitted"
                  categoryId={e.category_id}
                  payMeBy={e.pay_me_by}
                  categories={options}
                  self={e.adult_id === meId}
                  today={today}
                />
              </ExpenseCard>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="section-title px-1">
          Approved, to pay back ({toPay.length}
          {toPay.length ? `, ${fmtMoney(owed)}` : ""})
        </h2>
        {toPay.length === 0 ? (
          <p className="card text-sm text-muted">Nobody is waiting to be paid back.</p>
        ) : (
          <ul className="space-y-2">
            {toPay.map((e) => (
              <ExpenseCard key={e.id} e={e}>
                <ExpenseReview
                  id={e.id}
                  status="approved"
                  categoryId={e.category_id}
                  payMeBy={e.pay_me_by}
                  categories={options}
                  self={e.adult_id === meId}
                  today={today}
                />
              </ExpenseCard>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function ExpenseCard({ e, children }: { e: ExpenseRow; children?: React.ReactNode }) {
  const late = e.paid_by === "member" && e.status === "submitted" && daysBetween(e.spent_on, easternDate(e.created_at)) > RECEIPT_DAYS;
  const details = [fmtShortDate(e.spent_on), e.vendor, e.category?.name ?? (e.status === "submitted" ? "No category yet" : null), e.event?.title, e.den?.name].filter(Boolean);
  return (
    <li className="card space-y-2 py-3">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-sm font-bold text-ink">{expenseWho(e)}</span>
          <span className="block text-sm text-ink">{e.description}</span>
          <span className="block text-[11px] text-muted">{details.join(" · ")}</span>
          {e.pay_me_by && e.status !== "paid" && (
            <span className="block text-xs text-navy">Pay back by: {PAY_ME_BY_LABEL[e.pay_me_by].replace(/ \(.*\)$/, "")}</span>
          )}
          {e.note && <span className="block text-xs text-navy">“{e.note}”</span>}
          {e.status === "paid" && (
            <span className="block text-xs text-pine">
              {e.paid_by === "pack" ? "Paid" : "Paid back"}
              {e.paid_via ? ` · ${PAID_VIA_LABEL[e.paid_via]}` : ""}
              {e.paid_on ? ` · ${fmtShortDate(e.paid_on)}` : ""}
              {e.paid_ref ? ` · #${e.paid_ref}` : ""}
            </span>
          )}
          {e.review_note && <span className="block text-xs text-muted">Note: {e.review_note}</span>}
          {late && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-lg bg-gold-50 px-2 py-0.5 text-[11px] font-semibold text-gold-800">
              <Clock className="h-3 w-3" aria-hidden /> Sent more than {RECEIPT_DAYS} days after the purchase
            </span>
          )}
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-extrabold text-ink">{fmtMoney(e.amount_cents)}</span>
          {e.paid_by === "member" && (
            <span className={`badge normal-case tracking-normal ${EXPENSE_STATUS_STYLE[e.status]}`}>{EXPENSE_STATUS_LABEL[e.status]}</span>
          )}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
        {e.receipt_path ? (
          <a href={`/receipts/${e.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-pine underline">
            <Paperclip className="h-3.5 w-3.5" aria-hidden /> Receipt
          </a>
        ) : (
          <span className="text-muted">No receipt</span>
        )}
        <Link href={`/leaders/money/expenses/${e.id}`} className="text-navy underline">
          Edit
        </Link>
      </div>
      {children}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Expenses: everything for a season, filterable
// ---------------------------------------------------------------------------
async function ExpensesTab({
  season,
  seasons,
  categories,
  sp,
}: {
  season: string;
  seasons: string[];
  categories: FinanceCategory[];
  sp: Record<string, string | string[] | undefined>;
}) {
  const range = seasonRange(season)!;
  const cat = one(sp.cat);
  const status = one(sp.status);
  const all = await getExpenses({ from: range.from, to: range.to });
  const rows = all.filter((e) => (!cat || (cat === "none" ? !e.category_id : e.category_id === cat)) && (!status || e.status === status));
  const counted = rows.filter((e) => e.status === "paid" || e.status === "approved");
  const total = counted.reduce((s, e) => s + e.amount_cents, 0);
  const qs = new URLSearchParams({ tab: "expenses", season });
  if (cat) qs.set("cat", cat);
  if (status) qs.set("status", status);
  const back = `/leaders/money/expenses?${qs.toString()}`;
  const expenseCats = categories.filter((c) => c.kind === "expense");
  return (
    <>
      <SeasonPicker
        tab="expenses"
        season={season}
        seasons={seasons}
        extra={
          <>
            <label className="block min-w-36 flex-1 space-y-1">
              <span className="text-xs font-bold text-navy">Category</span>
              <select className="input py-2" name="cat" defaultValue={cat}>
                <option value="">All</option>
                <option value="none">No category yet</option>
                {expenseCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-28 flex-1 space-y-1">
              <span className="text-xs font-bold text-navy">Status</span>
              <select className="input py-2" name="status" defaultValue={status}>
                <option value="">All</option>
                {Object.entries(EXPENSE_STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
      />
      <p className="px-1 text-xs text-muted">
        {rows.length} expense{rows.length === 1 ? "" : "s"} · {fmtMoney(total)} spent or owed (declined and waiting requests aren&apos;t counted)
      </p>
      {rows.length === 0 ? (
        <p className="card text-sm text-muted">No expenses recorded for {season} yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.slice(0, 300).map((e) => (
            <ExpenseCard key={e.id} e={e}>
              <form action={deleteExpense} className="flex justify-end">
                <input type="hidden" name="id" value={e.id} />
                <input type="hidden" name="back" value={back} />
                <details className="text-right">
                  <summary className="cursor-pointer text-[11px] font-bold text-danger">Delete…</summary>
                  <SubmitButton className="mt-1 rounded-lg bg-alarm px-3 py-1.5 text-xs font-bold text-white">Delete this expense for good</SubmitButton>
                </details>
              </form>
            </ExpenseCard>
          ))}
        </ul>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Other income: money in the app doesn't count on its own
// ---------------------------------------------------------------------------
async function IncomeTab({ season, seasons, categories, today }: { season: string; seasons: string[]; categories: FinanceCategory[]; today: string }) {
  const range = seasonRange(season)!;
  const rows = await getIncome(range);
  const manual = categories.filter((c) => c.kind === "income" && !c.source && !c.archived_at);
  return (
    <>
      <section className="card space-y-2">
        <h2 className="section-title">Record money in</h2>
        <p className="text-xs text-muted">
          For money the app doesn&apos;t see on its own: a sponsor&apos;s check, popcorn commission, bank interest. Dues, event fees and
          Givebutter are counted automatically, so don&apos;t add those here.
        </p>
        <ActionForm action={saveIncome} submit="Record it">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Amount">
              <input className="input" name="amount" required inputMode="decimal" placeholder="$250" />
            </Field>
            <Field label="Date">
              <input className="input" type="date" name="received_on" required defaultValue={today} max={today} />
            </Field>
          </div>
          <Field label="What it was">
            <input className="input" name="description" required maxLength={200} placeholder="Popcorn commission, fall sale" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Category">
              <select className="input" name="category_id" required>
                {manual.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Came in by">
              <select className="input" name="received_via" defaultValue="check">
                {(Object.keys(RECEIVED_VIA_LABEL) as ReceivedVia[]).map((k) => (
                  <option key={k} value={k}>
                    {RECEIVED_VIA_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Check number or reference (optional)">
            <input className="input" name="reference" maxLength={60} />
          </Field>
        </ActionForm>
      </section>

      <SeasonPicker tab="income" season={season} seasons={seasons} />
      {rows.length === 0 ? (
        <p className="card text-sm text-muted">No other income recorded for {season}.</p>
      ) : (
        <ul className="card divide-y divide-line py-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{r.description}</span>
                <span className="block text-[11px] text-muted">
                  {[fmtShortDate(r.received_on), r.category?.name, r.received_via ? RECEIVED_VIA_LABEL[r.received_via] : null, r.reference ? `#${r.reference}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-extrabold text-ink">{fmtMoney(r.amount_cents)}</span>
                <form action={deleteIncome}>
                  <input type="hidden" name="id" value={r.id} />
                  <details>
                    <summary className="cursor-pointer text-[11px] font-bold text-danger">Delete…</summary>
                    <SubmitButton className="mt-1 rounded-lg bg-alarm px-2 py-1 text-[11px] font-bold text-white">Delete</SubmitButton>
                  </details>
                </form>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Budget: amounts per category for a season, and the categories themselves
// ---------------------------------------------------------------------------
async function BudgetTab({ season, seasons, categories }: { season: string; seasons: string[]; categories: FinanceCategory[] }) {
  const budget = await getBudget(season);
  const active = categories.filter((c) => !c.archived_at || budget.has(c.id));
  const income = active.filter((c) => c.kind === "income");
  const expense = active.filter((c) => c.kind === "expense");
  const sum = (list: FinanceCategory[]) => list.reduce((s, c) => s + (budget.get(c.id) ?? 0), 0);
  // Offer next season too, so the new budget can be entered in the spring.
  const next = (() => {
    const y = Math.max(...seasons.map((s) => Number(s.slice(0, 4)))) + 1;
    return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
  })();
  return (
    <>
      <SeasonPicker tab="budget" season={season} seasons={seasons.includes(next) ? seasons : [next, ...seasons]} />
      <section className="card space-y-3">
        <h2 className="section-title">Budget for {season}</h2>
        <p className="text-xs text-muted">Leave a line blank if it isn&apos;t budgeted. Reports compare what really came in and went out against these.</p>
        <ActionForm action={saveBudget} submit="Save budget">
          <input type="hidden" name="season" value={season} />
          {[
            { title: "Money in", list: income },
            { title: "Money out", list: expense },
          ].map((g) => (
            <fieldset key={g.title} className="space-y-1">
              <legend className="text-xs font-bold uppercase tracking-wider text-muted">
                {g.title} · {fmtMoney(sum(g.list))}
              </legend>
              {g.list.map((c) => (
                <label key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className={c.archived_at ? "text-muted line-through" : "text-ink"}>{c.name}</span>
                  <input
                    name={`b_${c.id}`}
                    inputMode="decimal"
                    defaultValue={budget.has(c.id) ? centsToInput(budget.get(c.id)) : ""}
                    aria-label={`Budget for ${c.name}`}
                    placeholder="$"
                    className="w-28 rounded-lg border border-line bg-card px-2 py-1.5 text-right text-sm"
                  />
                </label>
              ))}
            </fieldset>
          ))}
          <p className="text-sm font-bold text-ink">Planned difference: {fmtMoney(sum(income) - sum(expense))}{sum(income) < sum(expense) ? " short" : ""}</p>
        </ActionForm>
      </section>

      <section className="card space-y-3">
        <h2 className="section-title">Categories</h2>
        <p className="text-xs text-muted">Rename a category or hide one you no longer use (it stays in old reports).</p>
        <ul className="divide-y divide-line">
          {categories.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
              <ActionForm action={saveCategory} className="flex min-w-0 flex-1 items-center gap-2" buttonClass="btn-ghost px-3 py-1.5 text-xs" submit="Rename">
                <input type="hidden" name="id" value={c.id} />
                <span className="w-8 shrink-0 text-[10px] font-bold uppercase text-muted">{c.kind === "income" ? "In" : "Out"}</span>
                <input
                  name="name"
                  defaultValue={c.name}
                  maxLength={60}
                  required
                  aria-label="Category name"
                  className={`min-w-0 flex-1 rounded-lg border border-line bg-card px-2 py-1.5 text-sm ${c.archived_at ? "text-muted line-through" : ""}`}
                />
              </ActionForm>
              {c.source ? (
                <span className="text-[11px] text-muted">Counted by the app</span>
              ) : (
                <form action={toggleCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="season" value={season} />
                  <SubmitButton name="do" value={c.archived_at ? "show" : "hide"} className="rounded-lg px-2 py-1.5 text-xs font-bold text-navy underline">
                    {c.archived_at ? "Show" : "Hide"}
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
        <ActionForm action={saveCategory} submit="Add category" buttonClass="btn-ghost w-full py-2">
          <div className="grid grid-cols-3 gap-2">
            <select className="input" name="kind" defaultValue="expense" aria-label="Money in or out">
              <option value="expense">Money out</option>
              <option value="income">Money in</option>
            </select>
            <input className="input col-span-2" name="name" maxLength={60} placeholder="New category" required aria-label="New category name" />
          </div>
        </ActionForm>
      </section>
    </>
  );
}
