import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Paperclip, Plus, Receipt } from "lucide-react";
import BackLink from "@/components/BackLink";
import SubmitButton from "@/components/SubmitButton";
import { isCommittee, requireMember } from "@/lib/data";
import { getExpenses } from "@/lib/finance-data";
import { EXPENSE_STATUS_LABEL, EXPENSE_STATUS_STYLE, PAID_VIA_LABEL, PAY_ME_BY_LABEL, RECEIPT_DAYS } from "@/lib/finance";
import { fmtMoney } from "@/lib/money";
import { fmtShortDate } from "@/lib/advancement";
import { withdrawMyRequest } from "./actions";

export const metadata: Metadata = { title: "Get paid back" };

const DONE: Record<string, string> = {
  sent: "Sent. The treasurer will review it and let you know.",
  saved: "Your changes are saved.",
  withdrawn: "Your request was withdrawn.",
};

export default async function ReimbursePage({ searchParams }: PageProps<"/reimburse">) {
  const me = await requireMember();
  const sp = await searchParams;
  const done = DONE[String(sp.done ?? "")];
  const mine = await getExpenses({ adultId: me.id, limit: 200 });

  return (
    <>
      <BackLink href="/leaders" label="Leaders" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Get paid back</h1>
      <p className="-mt-1 text-sm text-muted">
        Bought something for the pack or your den? Send the receipt within {RECEIPT_DAYS} days and the treasurer will pay you back.
      </p>

      {done && (
        <p className="flex items-center gap-1.5 rounded-xl bg-mint p-3 text-sm font-semibold text-pine">
          <CircleCheck className="h-4 w-4 shrink-0" aria-hidden /> {done}
        </p>
      )}

      <Link href="/reimburse/new" className="btn-primary w-full">
        <Plus className="h-4 w-4" aria-hidden /> Ask to be paid back
      </Link>
      {isCommittee(me) && (
        <Link href="/leaders/money/expenses" className="btn-ghost w-full py-2">
          <Receipt className="h-4 w-4" aria-hidden /> Review everyone&apos;s requests
        </Link>
      )}

      <h2 className="section-title px-1">Your requests</h2>
      {mine.length === 0 ? (
        <p className="card text-sm text-muted">Nothing yet.</p>
      ) : (
        <ul className="space-y-2">
          {mine.map((e) => (
            <li key={e.id} className="card space-y-2 py-3">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-ink">{e.description}</span>
                  <span className="block text-[11px] text-muted">
                    {[fmtShortDate(e.spent_on), e.vendor, e.event?.title, e.category?.name].filter(Boolean).join(" · ")}
                  </span>
                  {e.status === "paid" && (
                    <span className="block text-xs text-pine">
                      Paid back{e.paid_via ? ` by ${PAID_VIA_LABEL[e.paid_via].toLowerCase()}` : ""}
                      {e.paid_on ? ` on ${fmtShortDate(e.paid_on)}` : ""}
                    </span>
                  )}
                  {e.status === "submitted" && e.pay_me_by && (
                    <span className="block text-xs text-muted">You asked for: {PAY_ME_BY_LABEL[e.pay_me_by].replace(/ \(.*\)$/, "")}</span>
                  )}
                  {e.review_note && <span className="block text-xs text-navy">From a key leader: “{e.review_note}”</span>}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-extrabold text-ink">{fmtMoney(e.amount_cents)}</span>
                  <span className={`badge normal-case tracking-normal ${EXPENSE_STATUS_STYLE[e.status]}`}>{EXPENSE_STATUS_LABEL[e.status]}</span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
                {e.receipt_path && (
                  <a href={`/receipts/${e.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-pine underline">
                    <Paperclip className="h-3.5 w-3.5" aria-hidden /> Receipt
                  </a>
                )}
                {e.status === "submitted" && (
                  <>
                    <Link href={`/reimburse/${e.id}`} className="text-navy underline">
                      Change
                    </Link>
                    <form action={withdrawMyRequest}>
                      <input type="hidden" name="id" value={e.id} />
                      <SubmitButton className="text-danger underline">Withdraw</SubmitButton>
                    </form>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
