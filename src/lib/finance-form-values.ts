import type { ExpenseFormValues } from "@/components/ExpenseForm";
import { centsToInput } from "./money";
import { expenseWho, type ExpenseRow } from "./finance";

/** An expense as the edit form's starting values. */
export function expenseFormValues(e: ExpenseRow): ExpenseFormValues {
  return {
    id: e.id,
    description: e.description,
    vendor: e.vendor,
    spent_on: e.spent_on,
    amount: centsToInput(e.amount_cents),
    category_id: e.category_id,
    event_id: e.event_id,
    den_id: e.den_id,
    paid_by: e.paid_by,
    status: e.status,
    pay_me_by: e.pay_me_by,
    note: e.note,
    review_note: e.review_note,
    receipt_name: e.receipt_name,
    paid_via: e.paid_via,
    paid_on: e.paid_on,
    paid_ref: e.paid_ref,
    who: expenseWho(e),
  };
}
