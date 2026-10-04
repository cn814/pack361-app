import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Download, Info, Receipt } from "lucide-react";
import BackLink from "@/components/BackLink";
import PrintButton from "@/components/PrintButton";
import { isCommittee, requireMember } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { getFinanceSeasons } from "@/lib/finance-data";
import { buildFinanceReport, type CategoryLine } from "@/lib/finance-report";
import { resolvePeriod } from "@/lib/finance";
import { fmtMoney } from "@/lib/money";
import { fmtShortDate } from "@/lib/advancement";
import { todayEastern } from "@/lib/money-data";

export const metadata: Metadata = { title: "Financial reports" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const monthName = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });

/** -$40 in red, $40 in green (for net and difference columns). */
function Signed({ cents, invert = false }: { cents: number; invert?: boolean }) {
  const good = invert ? cents <= 0 : cents >= 0;
  return <span className={good ? "text-pine" : "text-danger"}>{cents < 0 ? `-${fmtMoney(-cents)}` : fmtMoney(cents)}</span>;
}

export default async function ReportsPage({ searchParams }: PageProps<"/leaders/money/reports">) {
  const me = await requireMember();
  if (!isCommittee(me)) redirect("/leaders");
  const sp = await searchParams;
  const settings = await getSettings();
  const period = resolvePeriod({ season: one(sp.season), from: one(sp.from), to: one(sp.to) }, settings.dues_season);
  const [seasons, r] = await Promise.all([
    getFinanceSeasons(settings.dues_season),
    buildFinanceReport({ from: period.from, to: period.to, season: period.season, duesCampaignId: settings.dues_givebutter_campaign_id }),
  ]);
  const query = period.season ? `season=${period.season}` : `from=${period.from}&to=${period.to}`;
  const net = r.income - r.expenses;
  const showBudget = Boolean(r.season && r.hasBudget);

  return (
    <>
      <div className="print:hidden">
        <BackLink href="/leaders/money" label="Money" />
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Pack 361 financial report</h1>
      <p className="-mt-1 text-sm text-muted">
        {period.label} · made {fmtShortDate(todayEastern())}
      </p>

      <Form action="/leaders/money/reports" className="card grid grid-cols-2 gap-2 print:hidden">
        <label className="col-span-2 block space-y-1">
          <span className="text-xs font-bold text-navy">Season (July to June)</span>
          <select className="input py-2" name="season" defaultValue={period.season ?? ""}>
            {!period.season && <option value="">Custom dates</option>}
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-ghost col-span-2 py-2">Show season</button>
      </Form>
      <details className="card print:hidden">
        <summary className="cursor-pointer text-sm font-bold text-pine">Pick other dates (a month, a quarter, a campout…)</summary>
        <Form action="/leaders/money/reports" className="mt-2 grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-xs font-bold text-navy">From</span>
            <input className="input py-2" type="date" name="from" required defaultValue={period.from} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold text-navy">To</span>
            <input className="input py-2" type="date" name="to" required defaultValue={period.to} />
          </label>
          <button className="btn-ghost col-span-2 py-2">Show these dates</button>
        </Form>
      </details>

      <div className="flex flex-wrap gap-2 print:hidden">
        <PrintButton label="Print or save as PDF" />
        <a href={`/leaders/money/reports/csv?${query}&type=summary`} className="btn-ghost py-2">
          <Download className="h-4 w-4" aria-hidden /> Summary (CSV)
        </a>
        <a href={`/leaders/money/reports/csv?${query}&type=transactions`} className="btn-ghost py-2">
          <Download className="h-4 w-4" aria-hidden /> Every transaction (CSV)
        </a>
      </div>

      <section className="card grid grid-cols-3 gap-2 text-center">
        <div>
          <span className="block text-[11px] font-bold uppercase tracking-wider text-muted">Money in</span>
          <span className="block text-lg font-extrabold text-pine-950">{fmtMoney(r.income)}</span>
        </div>
        <div>
          <span className="block text-[11px] font-bold uppercase tracking-wider text-muted">Money out</span>
          <span className="block text-lg font-extrabold text-pine-950">{fmtMoney(r.expenses)}</span>
        </div>
        <div>
          <span className="block text-[11px] font-bold uppercase tracking-wider text-muted">{net >= 0 ? "Ahead" : "Behind"}</span>
          <span className="block text-lg font-extrabold">
            <Signed cents={net} />
          </span>
        </div>
      </section>

      {(r.owedToMembers.count > 0 || r.waitingReview.count > 0 || r.owedToPack.count > 0) && (
        <section className="card space-y-1 text-sm">
          <h2 className="section-title">Still outstanding</h2>
          {r.owedToMembers.count > 0 && (
            <p>
              <b>{fmtMoney(r.owedToMembers.cents)}</b> approved but not paid back yet ({r.owedToMembers.count} request
              {r.owedToMembers.count === 1 ? "" : "s"}). Already counted in money out.
            </p>
          )}
          {r.waitingReview.count > 0 && (
            <p>
              <b>{fmtMoney(r.waitingReview.cents)}</b> in reimbursement requests waiting for review ({r.waitingReview.count}). Not counted yet.{" "}
              <Link href="/leaders/money/expenses" className="font-bold text-pine underline print:no-underline">
                Review
              </Link>
            </p>
          )}
          {r.owedToPack.count > 0 && (
            <p>
              <b>{fmtMoney(r.owedToPack.cents)}</b> families still owe the pack for this period ({r.owedToPack.count} item
              {r.owedToPack.count === 1 ? "" : "s"}). Not counted until paid.
            </p>
          )}
        </section>
      )}

      <CategoryTable title="Money in" lines={r.incomeLines} total={r.income} budgetTotal={r.budgetIncome} showBudget={showBudget} />
      <CategoryTable title="Money out" lines={r.expenseLines} total={r.expenses} budgetTotal={r.budgetExpenses} showBudget={showBudget} spending />
      {r.season && !r.hasBudget && (
        <p className="flex items-start gap-2 px-1 text-xs text-muted print:hidden">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Enter the {r.season} budget to compare it with what really happened:{" "}
            <Link href={`/leaders/money/expenses?tab=budget&season=${r.season}`} className="font-bold text-pine underline">
              Expenses → Budget
            </Link>
          </span>
        </p>
      )}

      {r.byMethod.length > 0 && (
        <section className="card space-y-2">
          <h2 className="section-title">How money came in</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              {r.byMethod.map((m) => (
                <tr key={m.label}>
                  <td className="py-1.5">{m.label}</td>
                  <td className="py-1.5 text-right font-semibold">{fmtMoney(m.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-muted">
            Givebutter and PayPal amounts are what families paid, before those services take their fees. To count the fees, record them as
            an expense under “Bank and payment fees”.
          </p>
        </section>
      )}

      <section className="card space-y-2">
        <h2 className="section-title">By month</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="py-1 font-bold">Month</th>
              <th className="py-1 text-right font-bold">In</th>
              <th className="py-1 text-right font-bold">Out</th>
              <th className="py-1 text-right font-bold">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {r.byMonth.map((m) => (
              <tr key={m.month} className={m.income || m.expenses ? "" : "text-muted"}>
                <td className="py-1.5">{monthName(m.month)}</td>
                <td className="py-1.5 text-right">{fmtMoney(m.income)}</td>
                <td className="py-1.5 text-right">{fmtMoney(m.expenses)}</td>
                <td className="py-1.5 text-right font-semibold">
                  <Signed cents={m.income - m.expenses} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {r.byEvent.length > 0 && (
        <section className="card space-y-2">
          <h2 className="section-title">By event</h2>
          <p className="text-[11px] text-muted">Event fees and Givebutter sales linked to an event, against expenses marked for that event.</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="py-1 font-bold">Event</th>
                <th className="py-1 text-right font-bold">In</th>
                <th className="py-1 text-right font-bold">Out</th>
                <th className="py-1 text-right font-bold">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.byEvent.map((e) => (
                <tr key={e.id}>
                  <td className="py-1.5">
                    {e.title}
                    {e.date && <span className="block text-[11px] text-muted">{fmtShortDate(e.date)}</span>}
                  </td>
                  <td className="py-1.5 text-right">{fmtMoney(e.income)}</td>
                  <td className="py-1.5 text-right">{fmtMoney(e.expenses)}</td>
                  <td className="py-1.5 text-right font-semibold">
                    <Signed cents={e.income - e.expenses} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {r.byDen.length > 0 && (
        <section className="card space-y-2">
          <h2 className="section-title">Den spending</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              {r.byDen.map((d) => (
                <tr key={d.name}>
                  <td className="py-1.5">{d.name}</td>
                  <td className="py-1.5 text-right font-semibold">{fmtMoney(d.expenses)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {r.txns.length === 0 && (
        <p className="card flex items-start gap-2 text-sm text-muted">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Nothing recorded for these dates yet.
        </p>
      )}

      <p className="px-1 text-[11px] text-muted">
        Money in counts payments the app recorded (PayPal, check, cash), Givebutter orders, and income entered by hand. Money out counts
        expenses key leaders approved or paid, by the date on the receipt.{" "}
        <Link href="/leaders/money/expenses" className="inline-flex items-center gap-1 font-bold text-pine underline print:hidden">
          <Receipt className="h-3 w-3" aria-hidden /> Expenses
        </Link>
      </p>
    </>
  );
}

function CategoryTable({
  title,
  lines,
  total,
  budgetTotal,
  showBudget,
  spending = false,
}: {
  title: string;
  lines: CategoryLine[];
  total: number;
  budgetTotal: number;
  showBudget: boolean;
  spending?: boolean;
}) {
  return (
    <section className="card space-y-2">
      <h2 className="section-title">{title}</h2>
      {lines.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="py-1 font-bold">Category</th>
              <th className="py-1 text-right font-bold">Actual</th>
              {showBudget && <th className="py-1 text-right font-bold">Budget</th>}
              {showBudget && <th className="py-1 text-right font-bold">{spending ? "Left" : "Diff."}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l) => (
              <tr key={l.id ?? "none"} className="align-top">
                <td className="py-1.5">
                  {l.name}
                  {l.parts.map((p) => (
                    <span key={p.label} className="block text-[11px] text-muted">
                      {p.label}: {fmtMoney(p.cents)}
                    </span>
                  ))}
                </td>
                <td className="py-1.5 text-right font-semibold">{fmtMoney(l.actual)}</td>
                {showBudget && <td className="py-1.5 text-right text-muted">{l.budget === null ? "" : fmtMoney(l.budget)}</td>}
                {showBudget && (
                  <td className="py-1.5 text-right">
                    {l.budget === null ? "" : spending ? <Signed cents={l.budget - l.actual} /> : <Signed cents={l.actual - l.budget} />}
                  </td>
                )}
              </tr>
            ))}
            <tr className="font-extrabold">
              <td className="py-1.5">Total</td>
              <td className="py-1.5 text-right">{fmtMoney(total)}</td>
              {showBudget && <td className="py-1.5 text-right">{fmtMoney(budgetTotal)}</td>}
              {showBudget && (
                <td className="py-1.5 text-right">{spending ? <Signed cents={budgetTotal - total} /> : <Signed cents={total - budgetTotal} />}</td>
              )}
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}
