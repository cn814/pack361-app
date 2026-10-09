import { NextResponse, type NextRequest } from "next/server";
import { getMe, isCommittee } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { buildFinanceReport } from "@/lib/finance-report";
import { resolvePeriod } from "@/lib/finance";
import { csvDollars, toCsv } from "@/lib/csv";
import { easternDate } from "@/lib/tz";
import { logDownload } from "@/lib/security-log";

// Leadership: the financial report as a spreadsheet. type=summary (categories against the
// budget, months, events, dens) or type=transactions (every dollar in and out).
export async function GET(request: NextRequest) {
  const me = await getMe();
  if (!me?.adult || !isCommittee(me.adult)) return NextResponse.json({ error: "Key leaders only" }, { status: 403 });
  const p = request.nextUrl.searchParams;
  const settings = await getSettings();
  const period = resolvePeriod(
    { season: p.get("season") ?? undefined, from: p.get("from") ?? undefined, to: p.get("to") ?? undefined },
    settings.dues_season,
  );
  const r = await buildFinanceReport({ from: period.from, to: period.to, season: period.season, duesCampaignId: settings.dues_givebutter_campaign_id });
  const type = p.get("type") === "transactions" ? "transactions" : "summary";
  const rows: (string | number | null)[][] = [];

  if (type === "transactions") {
    rows.push(["Date", "In or out", "Category", "Description", "Who", "How", "Amount", "Status", "Reference", "Event", "Den", "From"]);
    for (const t of r.txns) {
      rows.push([
        t.date,
        t.dir === "in" ? "In" : "Out",
        t.category,
        t.description,
        t.who,
        t.method,
        csvDollars(t.dir === "in" ? t.amountCents : -t.amountCents),
        t.status,
        t.reference,
        t.event,
        t.den,
        { charge: "App payment", givebutter: "Givebutter", income: "Entered by hand", expense: "Expense" }[t.source],
      ]);
    }
  } else {
    const budget = Boolean(r.season && r.hasBudget);
    rows.push([`Pack 361 financial report, ${period.label}`]);
    rows.push([]);
    rows.push(["Money in", "Actual", ...(budget ? ["Budget", "Difference"] : [])]);
    for (const l of r.incomeLines) {
      rows.push([l.name, csvDollars(l.actual), ...(budget ? [csvDollars(l.budget), l.budget === null ? "" : csvDollars(l.actual - l.budget)] : [])]);
      for (const part of l.parts) rows.push([`   ${part.label}`, csvDollars(part.cents)]);
    }
    rows.push(["Total money in", csvDollars(r.income), ...(budget ? [csvDollars(r.budgetIncome), csvDollars(r.income - r.budgetIncome)] : [])]);
    rows.push([]);
    rows.push(["Money out", "Actual", ...(budget ? ["Budget", "Left"] : [])]);
    for (const l of r.expenseLines) {
      rows.push([l.name, csvDollars(l.actual), ...(budget ? [csvDollars(l.budget), l.budget === null ? "" : csvDollars(l.budget - l.actual)] : [])]);
    }
    rows.push(["Total money out", csvDollars(r.expenses), ...(budget ? [csvDollars(r.budgetExpenses), csvDollars(r.budgetExpenses - r.expenses)] : [])]);
    rows.push([]);
    rows.push(["Net (in minus out)", csvDollars(r.income - r.expenses)]);
    rows.push(["Approved, not paid back yet", csvDollars(r.owedToMembers.cents)]);
    rows.push(["Requests waiting for review (not counted)", csvDollars(r.waitingReview.cents)]);
    rows.push(["Families still owe the pack (not counted)", csvDollars(r.owedToPack.cents)]);
    rows.push([]);
    rows.push(["Month", "In", "Out", "Net"]);
    for (const m of r.byMonth) rows.push([m.month, csvDollars(m.income), csvDollars(m.expenses), csvDollars(m.income - m.expenses)]);
    if (r.byEvent.length) {
      rows.push([]);
      rows.push(["Event", "Date", "In", "Out", "Net"]);
      for (const e of r.byEvent) rows.push([e.title, e.date, csvDollars(e.income), csvDollars(e.expenses), csvDollars(e.income - e.expenses)]);
    }
    if (r.byDen.length) {
      rows.push([]);
      rows.push(["Den", "Spent"]);
      for (const d of r.byDen) rows.push([d.name, csvDollars(d.expenses)]);
    }
  }

  const span = period.season ?? `${period.from}_to_${period.to}`;
  const name = `pack361-${type === "summary" ? "financial-report" : "transactions"}-${span}-${easternDate(Date.now())}.csv`;
  await logDownload("finance_report");
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
