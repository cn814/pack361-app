import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Paperclip } from "lucide-react";
import BackLink from "@/components/BackLink";
import ExpenseForm from "@/components/ExpenseForm";
import { isCommittee, requireMember } from "@/lib/data";
import { getCategories, getExpense, getExpenseEvents } from "@/lib/finance-data";
import { expenseFormValues } from "@/lib/finance-form-values";
import { EXPENSE_STATUS_LABEL } from "@/lib/finance";
import { getDens } from "@/lib/roster-data";
import { todayEastern } from "@/lib/money-data";
import { saveExpense } from "../actions";

export const metadata: Metadata = { title: "Edit expense" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function EditExpensePage({ params }: PageProps<"/leaders/money/expenses/[id]">) {
  const me = await requireMember();
  if (!isCommittee(me)) redirect("/leaders");
  const { id } = await params;
  if (!UUID.test(id)) redirect("/leaders/money/expenses");
  const e = await getExpense(id);
  if (!e) redirect("/leaders/money/expenses");
  const [categories, events, dens] = await Promise.all([getCategories({ kind: "expense", withArchived: true }), getExpenseEvents(), getDens()]);
  if (e.event_id && e.event && !events.some((ev) => ev.id === e.event_id)) events.unshift({ id: e.event_id, name: e.event.title });
  const back = e.status === "submitted" || e.status === "approved" ? "/leaders/money/expenses" : "/leaders/money/expenses?tab=expenses";
  return (
    <>
      <BackLink href={back} label="Expenses" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Edit expense</h1>
      <p className="-mt-1 text-sm text-muted">
        {e.paid_by === "member" ? `Reimbursement request: ${EXPENSE_STATUS_LABEL[e.status].toLowerCase()}.` : "Paid by the pack."}
        {e.receipt_path && (
          <>
            {" "}
            <a href={`/receipts/${e.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-bold text-pine underline">
              <Paperclip className="h-3.5 w-3.5" aria-hidden /> Open the receipt
            </a>
          </>
        )}
      </p>
      {e.note && <p className="card text-sm text-navy">From {e.adult?.preferred_name || e.adult?.first_name || "them"}: “{e.note}”</p>}
      <section className="card">
        <ExpenseForm
          mode="leader"
          action={saveExpense}
          values={expenseFormValues(e)}
          categories={categories.filter((c) => !c.archived_at || c.id === e.category_id).map((c) => ({ id: c.id, name: c.name }))}
          events={events}
          dens={dens.map((d) => ({ id: d.id, name: d.name }))}
          today={todayEastern()}
          submitLabel="Save changes"
          back={back}
        />
      </section>
    </>
  );
}
