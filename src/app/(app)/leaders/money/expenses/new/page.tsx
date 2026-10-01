import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import ExpenseForm from "@/components/ExpenseForm";
import { isCommittee, requireMember } from "@/lib/data";
import { getCategories, getExpenseEvents } from "@/lib/finance-data";
import { getDens } from "@/lib/roster-data";
import { createClient } from "@/lib/supabase/server";
import { todayEastern } from "@/lib/money-data";
import { saveExpense } from "../actions";

export const metadata: Metadata = { title: "Record an expense" };

export default async function NewExpensePage() {
  const me = await requireMember();
  if (!isCommittee(me)) redirect("/leaders");
  const supabase = await createClient();
  const [categories, events, dens, { data: adults }] = await Promise.all([
    getCategories({ kind: "expense" }),
    getExpenseEvents(),
    getDens(false),
    supabase.from("adults").select("id, first_name, preferred_name, last_name").eq("is_active", true).order("last_name").order("first_name"),
  ]);
  return (
    <>
      <BackLink href="/leaders/money/expenses?tab=expenses" label="Expenses" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Record an expense</h1>
      <p className="-mt-1 text-sm text-muted">
        Something the pack paid for, or something a member bought that the pack owes them for. Members can also send their own requests
        from Leaders → Get paid back.
      </p>
      <section className="card">
        <ExpenseForm
          mode="leader"
          action={saveExpense}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          events={events}
          dens={dens.map((d) => ({ id: d.id, name: d.name }))}
          adults={((adults ?? []) as { id: string; first_name: string; preferred_name: string | null; last_name: string }[]).map((a) => ({
            id: a.id,
            name: `${a.preferred_name || a.first_name} ${a.last_name}${a.id === me.id ? " (you)" : ""}`,
          }))}
          today={todayEastern()}
          submitLabel="Save expense"
        />
      </section>
    </>
  );
}
