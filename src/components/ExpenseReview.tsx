"use client";

import { useActionState, useState } from "react";
import { CircleCheck } from "lucide-react";
import { useSubmitKeepingValues, type ActionResult } from "@/components/ActionForm";
import { reviewExpense } from "@/app/(app)/leaders/money/expenses/actions";
import { PAID_VIA_LABEL, type PaidVia, type PayMeBy } from "@/lib/finance";

/**
 * The buttons on a reimbursement request: approve, pay back, or decline. Picking a category
 * is part of approving. Your own request shows a note instead (someone else handles it).
 */
export default function ExpenseReview({
  id,
  status,
  categoryId,
  payMeBy,
  categories,
  self,
  today,
}: {
  id: string;
  status: "submitted" | "approved";
  categoryId: string | null;
  payMeBy: PayMeBy | null;
  categories: { id: string; name: string }[];
  self: boolean;
  today: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(reviewExpense, {});
  const onSubmit = useSubmitKeepingValues(formAction);
  const [mode, setMode] = useState<"" | "pay" | "decline">("");

  if (self) {
    return <p className="text-xs font-semibold text-muted">This is your own request, so another leadership member approves and pays it.</p>;
  }
  if (state.ok && !pending) {
    return (
      <p className="flex items-center gap-1.5 text-sm font-semibold text-pine">
        <CircleCheck className="h-4 w-4" aria-hidden /> {state.message}
      </p>
    );
  }
  const defaultVia: PaidVia = payMeBy && payMeBy in PAID_VIA_LABEL ? (payMeBy as PaidVia) : "check";
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <label className="block space-y-1">
        <span className="text-xs font-bold text-navy">Budget category</span>
        <select className="input py-2" name="category_id" defaultValue={categoryId ?? ""}>
          <option value="">Choose a category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {mode === "pay" && (
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-low p-2">
          <label className="block space-y-1">
            <span className="text-xs font-bold text-navy">Paid back by</span>
            <select className="input py-2" name="paid_via" defaultValue={defaultVia}>
              {(Object.keys(PAID_VIA_LABEL) as PaidVia[]).map((k) => (
                <option key={k} value={k}>
                  {PAID_VIA_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold text-navy">On</span>
            <input className="input py-2" type="date" name="paid_on" defaultValue={today} max={today} required />
          </label>
          <label className="col-span-2 block space-y-1">
            <span className="text-xs font-bold text-navy">Check number or reference (optional)</span>
            <input className="input py-2" name="paid_ref" maxLength={60} />
          </label>
        </div>
      )}
      {mode === "decline" && (
        <label className="block space-y-1">
          <span className="text-xs font-bold text-navy">Why? (sent to them)</span>
          <textarea className="input min-h-16" name="review_note" maxLength={500} required />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {mode === "" && (
          <>
            {status === "submitted" && (
              <button name="do" value="approve" className="btn-primary px-3 py-1.5 text-xs" disabled={pending}>
                Approve
              </button>
            )}
            <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setMode("pay")}>
              {status === "submitted" ? "Approve and pay back" : "Mark paid back"}
            </button>
            <button type="button" className="rounded-lg px-2 py-1.5 text-xs font-bold text-danger underline" onClick={() => setMode("decline")}>
              Decline
            </button>
          </>
        )}
        {mode === "pay" && (
          <button name="do" value="pay" className={`btn-primary px-3 py-1.5 text-xs ${pending ? "is-busy" : ""}`} disabled={pending}>
            Save as paid back
          </button>
        )}
        {mode === "decline" && (
          <button name="do" value="decline" className={`rounded-lg bg-danger px-3 py-1.5 text-xs font-bold text-white ${pending ? "is-busy" : ""}`} disabled={pending}>
            Decline and tell them
          </button>
        )}
        {mode !== "" && (
          <button type="button" className="rounded-lg px-2 py-1.5 text-xs font-bold text-navy underline" onClick={() => setMode("")}>
            Back
          </button>
        )}
      </div>
      {state.error && !pending && <p className="text-sm font-semibold text-danger">{state.error}</p>}
    </form>
  );
}
