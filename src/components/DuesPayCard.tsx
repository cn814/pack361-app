import { ExternalLink } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import { reportPaidAnotherWay } from "@/app/(app)/pay/actions";
import { fmtMoney } from "@/lib/money";
import { fmtShortDate } from "@/lib/advancement";
import type { PayItem } from "@/components/PayCheckout";

/** Pay page: pack dues are paid on the pack's Givebutter page. */
export default function DuesPayCard({ items, url }: { items: PayItem[]; url: string }) {
  const total = items.reduce((s, i) => s + i.amount_cents, 0);
  return (
    <section className="card space-y-2 border-l-4 border-l-gold">
      <h2 className="section-title">Pack dues</h2>
      <ul className="divide-y divide-line">
        {items.map((i) => (
          <li key={i.id} className="flex items-start justify-between gap-2 py-2">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{i.title}</span>
              {(i.detail || i.due_on) && (
                <span className="block text-[11px] text-muted">
                  {[i.detail, i.due_on ? `due ${fmtShortDate(i.due_on)}` : null].filter(Boolean).join(" · ")}
                </span>
              )}
            </span>
            <span className="shrink-0 text-sm font-bold text-ink">{fmtMoney(i.amount_cents)}</span>
          </li>
        ))}
      </ul>
      <a href={url} target="_blank" rel="noopener noreferrer" className="btn-gold w-full">
        Pay dues on Givebutter ({fmtMoney(total)}) <ExternalLink className="h-4 w-4" aria-hidden />
      </a>
      <p className="text-xs text-muted">
        This is how the pack takes dues. On Givebutter, enter {fmtMoney(total)} and your scout{items.length === 1 ? "'s name" : "s' names"}{" "}
        and use the email you use here. It shows as paid here within a day.
      </p>
      <details>
        <summary className="cursor-pointer text-xs font-bold text-pine">I paid dues another way</summary>
        <ActionForm action={reportPaidAnotherWay} submit="Let the leaders know" busy="Saving…" className="mt-2 space-y-2" buttonClass="btn-ghost w-full py-2">
          {items.map((i) => (
            <input key={i.id} type="hidden" name="id" value={i.id} />
          ))}
          <div className="grid grid-cols-3 gap-2 text-sm">
            {(["check", "cash", "other"] as const).map((h) => (
              <label key={h} className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-white p-2 font-semibold text-navy">
                <input type="radio" name="how" value={h} defaultChecked={h === "check"} className="accent-pine" />
                {h === "check" ? "Check" : h === "cash" ? "Cash" : "Other"}
              </label>
            ))}
          </div>
          <input className="input" name="note" maxLength={300} placeholder="Note for the leaders (optional)" />
        </ActionForm>
      </details>
    </section>
  );
}
