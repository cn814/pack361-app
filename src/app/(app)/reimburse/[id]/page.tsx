import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import ExpenseForm from "@/components/ExpenseForm";
import { requireMember } from "@/lib/data";
import { getCategories, getExpense, getExpenseEvents } from "@/lib/finance-data";
import { expenseFormValues } from "@/lib/finance-form-values";
import { getDens } from "@/lib/roster-data";
import { todayEastern } from "@/lib/money-data";
import { saveMyRequest } from "../actions";

export const metadata: Metadata = { title: "Change your request" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function EditRequestPage({ params }: PageProps<"/reimburse/[id]">) {
  const me = await requireMember();
  const { id } = await params;
  if (!UUID.test(id)) redirect("/reimburse");
  const e = await getExpense(id);
  // Only your own, and only until leadership acts on it.
  if (!e || e.adult_id !== me.id || e.status !== "submitted") redirect("/reimburse");
  const [categories, events, dens] = await Promise.all([getCategories({ kind: "expense" }), getExpenseEvents(), getDens(false)]);
  if (e.event_id && e.event && !events.some((ev) => ev.id === e.event_id)) events.unshift({ id: e.event_id, name: e.event.title });
  return (
    <>
      <BackLink href="/reimburse" label="Get paid back" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Change your request</h1>
      <section className="card">
        <ExpenseForm
          mode="member"
          action={saveMyRequest}
          values={expenseFormValues(e)}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          events={events}
          dens={dens.map((d) => ({ id: d.id, name: d.name }))}
          today={todayEastern()}
          submitLabel="Save changes"
        />
      </section>
    </>
  );
}
