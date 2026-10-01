import type { Metadata } from "next";
import BackLink from "@/components/BackLink";
import ExpenseForm from "@/components/ExpenseForm";
import { requireMember } from "@/lib/data";
import { getCategories, getExpenseEvents } from "@/lib/finance-data";
import { getDens } from "@/lib/roster-data";
import { todayEastern } from "@/lib/money-data";
import { saveMyRequest } from "../actions";

export const metadata: Metadata = { title: "Ask to be paid back" };

export default async function NewRequestPage() {
  await requireMember();
  const [categories, events, dens] = await Promise.all([getCategories({ kind: "expense" }), getExpenseEvents(), getDens(false)]);
  return (
    <>
      <BackLink href="/reimburse" label="Get paid back" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Ask to be paid back</h1>
      <section className="card">
        <ExpenseForm
          mode="member"
          action={saveMyRequest}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          events={events}
          dens={dens.map((d) => ({ id: d.id, name: d.name }))}
          today={todayEastern()}
          submitLabel="Send to the treasurer"
        />
      </section>
    </>
  );
}
