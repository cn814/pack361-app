import Link from "next/link";
import { CircleCheck, ExternalLink, HandCoins } from "lucide-react";
import { chargeFor, fmtMoney, PAID_VIA_LABEL, type ChargeRow } from "@/lib/money";
import { fmtShortDate } from "@/lib/advancement";
import { easternDate } from "@/lib/tz";

/**
 * My family: what's due (with a Pay button) and the last few things paid. With a Givebutter dues
 * page (duesUrl), dues are paid there and everything else on the Pay page.
 */
export default function PaymentsCard({ charges, duesUrl = null }: { charges: ChargeRow[]; duesUrl?: string | null }) {
  const due = charges.filter((c) => c.status === "open" && c.amount_cents > 0);
  const waiting = charges.filter((c) => c.status === "reported");
  const paid = charges
    .filter((c) => c.status === "paid")
    .sort((a, b) => (b.paid_at ?? b.created_at).localeCompare(a.paid_at ?? a.created_at))
    .slice(0, 3);
  if (!due.length && !waiting.length && !paid.length) return null;
  const duesDue = duesUrl ? due.filter((c) => c.kind === "dues") : [];
  const duesTotal = duesDue.reduce((s, c) => s + c.amount_cents, 0);
  const total = due.reduce((s, c) => s + c.amount_cents, 0) - duesTotal;
  return (
    <section id="payments" className="card scroll-mt-20 space-y-3">
      <h2 className="section-title flex items-center gap-1.5">
        <HandCoins className="h-4 w-4" aria-hidden /> Payments
      </h2>
      {due.length > 0 ? (
        <>
          <ul className="divide-y divide-line">
            {due.slice(0, 5).map((c) => {
              const who = chargeFor(c);
              return (
                <li key={c.id} className="flex items-start justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{c.title}</span>
                    {(who || c.due_on) && (
                      <span className="block text-[11px] text-muted">
                        {[who ? `For ${who}` : null, c.due_on ? `due ${fmtShortDate(c.due_on)}` : null].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm font-bold text-ink">{fmtMoney(c.amount_cents)}</span>
                </li>
              );
            })}
          </ul>
          {due.length > 5 && <p className="text-xs text-muted">and {due.length - 5} more</p>}
          {duesUrl && duesDue.length > 0 && (
            <>
              <a href={duesUrl} target="_blank" rel="noopener noreferrer" className="btn-gold w-full">
                Pay dues on Givebutter ({fmtMoney(duesTotal)}) <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
              <p className="text-[11px] text-muted">The pack takes dues on Givebutter. It shows as paid here within a day.</p>
            </>
          )}
          {due.length > duesDue.length && (
            <Link href="/pay" className={duesDue.length ? "btn-ghost w-full" : "btn-gold w-full"}>
              <HandCoins className="h-4 w-4" aria-hidden /> Pay {duesDue.length ? "everything else, " : ""}
              {fmtMoney(total)}
            </Link>
          )}
        </>
      ) : (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-pine">
          <CircleCheck className="h-4 w-4" aria-hidden /> Nothing due right now.
        </p>
      )}
      {waiting.length > 0 && (
        <p className="text-xs text-muted">
          {waiting.length} payment{waiting.length === 1 ? "" : "s"} you made another way {waiting.length === 1 ? "is" : "are"} waiting for
          a leader to confirm.
        </p>
      )}
      {paid.length > 0 && (
        <div className="space-y-1 border-t border-line pt-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Recently paid</p>
          <ul className="space-y-1 text-xs text-muted">
            {paid.map((c) => (
              <li key={c.id} className="flex justify-between gap-2">
                <span className="min-w-0 truncate">
                  {c.title}
                  {chargeFor(c) ? ` (${chargeFor(c)})` : ""}
                </span>
                <span className="shrink-0">
                  {fmtMoney(c.paid_amount_cents ?? c.amount_cents)}
                  {c.paid_at ? ` · ${fmtShortDate(easternDate(c.paid_at))}` : ""}
                  {c.paid_via ? ` · ${PAID_VIA_LABEL[c.paid_via]}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <Link href="/pay" className="text-xs font-bold text-pine underline">
            All payments
          </Link>
        </div>
      )}
    </section>
  );
}
