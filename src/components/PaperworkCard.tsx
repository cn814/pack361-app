import Link from "next/link";
import { FileText, Wallet } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import { reportDuesPaid, reportHealthForm } from "@/app/(app)/paperwork-actions";
import { AHMR_URL, FORM_STATE_LABEL, FORM_STATE_STYLE, formState, type DuesInfo, type Person } from "@/lib/paperwork";
import { fmtShortDate } from "@/lib/advancement";

/** My family: medical forms for each person, and this season's dues. */
export default function PaperworkCard({ people, dues }: { people: Person[]; dues: DuesInfo | null }) {
  return (
    <section id="paperwork" className="card scroll-mt-20 space-y-3">
      <h2 className="section-title flex items-center gap-1.5">
        <FileText className="h-4 w-4" aria-hidden /> Paperwork
      </h2>
      <div className="space-y-1">
        <p className="text-sm font-bold text-ink">Medical forms (Parts A and B)</p>
        <p className="text-xs text-muted">
          Needed by everyone who goes on a campout, adults too, and good for 12 months.{" "}
          <a href={AHMR_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-pine underline">
            Download the form
          </a>
          , fill it out, and give the paper copy to a leader. Don&apos;t upload it here: the app never stores medical
          information. <Link href="/guide/medical-forms" className="font-semibold text-pine underline">More about medical forms</Link>
        </p>
      </div>
      <ul className="divide-y divide-line">
        {people.map((p) => {
          const state = formState(p.form);
          const done = state === "current" || state === "submitted";
          return (
            <li key={`${p.kind}-${p.id}`} className="py-2">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{p.name}</span>
                  <span className="block text-[11px] text-muted">
                    {p.detail}
                    {p.form?.expires_on && state !== "submitted" ? ` · good through ${fmtShortDate(p.form.expires_on)}` : ""}
                  </span>
                </span>
                <span className={`badge shrink-0 normal-case tracking-normal ${FORM_STATE_STYLE[state]}`}>{FORM_STATE_LABEL[state]}</span>
              </div>
              {!done && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs font-bold text-pine">I turned it in</summary>
                  <ActionForm action={reportHealthForm} submit="Save" busy="Saving…" className="mt-2 flex items-end gap-2" buttonClass="btn-primary py-2">
                    <input type="hidden" name="who" value={`${p.kind === "scout" ? "s" : "a"}:${p.id}`} />
                    <label className="block flex-1 space-y-1">
                      <span className="text-[11px] font-bold text-navy">Date signed on the form</span>
                      <input type="date" name="form_date" className="input py-2" />
                    </label>
                  </ActionForm>
                </details>
              )}
            </li>
          );
        })}
      </ul>

      {dues && (dues.amount || dues.row) && (
        <div className="space-y-1 border-t border-line pt-3">
          <div className="flex items-start justify-between gap-2">
            <span>
              <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
                <Wallet className="h-4 w-4 text-pine" aria-hidden /> Pack dues, {dues.season}
              </span>
              {dues.amount && <span className="block text-xs text-muted">{dues.amount}</span>}
            </span>
            <span
              className={`badge shrink-0 normal-case tracking-normal ${
                dues.row?.status === "paid" ? "bg-mint text-pine" : dues.row ? "bg-gold-50 text-gold-800" : "bg-surface text-muted"
              }`}
            >
              {dues.row?.status === "paid" ? "Paid" : dues.row ? "Waiting for a leader to confirm" : "Not paid yet"}
            </span>
          </div>
          {!dues.row && (
            <>
              {dues.how && <p className="whitespace-pre-line text-xs text-ink">{dues.how}</p>}
              <ActionForm action={reportDuesPaid} submit="We paid" busy="Saving…" buttonClass="btn-ghost w-full py-2" />
            </>
          )}
          <p className="text-[11px] text-muted">
            If cost is ever a reason your scout might miss out, talk to the Cubmaster or Committee Chair privately.
          </p>
        </div>
      )}
    </section>
  );
}
