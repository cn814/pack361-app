import { BellRing, ChevronDown, CircleCheck, ClipboardCheck, FileText, HandCoins, HandHelping, PenLine, ShieldAlert, ShieldCheck } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import { remindFamilies } from "@/app/(app)/events/ready-actions";
import { getReadiness, type ReadyKind, type ReadyReport, type ReadyRow } from "@/lib/ready";
import { brevoConfigured } from "@/lib/bulk-email";
import { emailConfigured } from "@/lib/email";
import { fmtTime, timeAgo } from "@/lib/format";
import type { Adult, PackEvent } from "@/lib/types";

/**
 * Leaders: "Ready to go?" for an event that takes RSVPs. What the families going still need
 * (medical forms, permission slips, payment, volunteer jobs, trained adults for overnights),
 * with a button to remind just those families. Renders nothing for families. The payment row
 * is built only for key leaders (see canSeeMoney in lib/ready).
 */
export default async function ReadyToGo({ e, me }: { e: PackEvent; me: Adult }) {
  if (e.category === "Den Meeting") return null; // a regular den meeting needs no checklist
  const report = await getReadiness(e, me);
  if (!report) return null;
  return <ReadyCard report={report} canEmail={brevoConfigured() || emailConfigured()} />;
}

const ICON: Record<ReadyKind, typeof FileText> = { medical: FileText, slips: PenLine, pay: HandCoins, jobs: HandHelping };
const BUTTON: Record<ReadyKind, string> = {
  medical: "Remind these families",
  slips: "Remind these families",
  pay: "Remind these families",
  jobs: "Ask families going to help",
};

/** The card itself (no data loading), so it can be shown with any report. */
export function ReadyCard({ report, canEmail }: { report: ReadyReport; canEmail: boolean }) {
  const { rows, training, going } = report;
  const problems = rows.filter((r) => r.families.length && r.kind !== "jobs").length;
  const trainingGaps = (training ?? []).filter((t) => !t.names.length).length;
  return (
    <section id="ready" className="card scroll-mt-20 space-y-3 border-l-4 border-l-pine">
      <div>
        <h2 className="section-title flex items-center gap-1.5">
          <ClipboardCheck className="h-4 w-4" aria-hidden /> Ready to go?
        </h2>
        <p className="text-xs text-muted">
          Leaders only · {going ? `the ${going} ${going === 1 ? "family" : "families"} going` : "nobody has said Going yet"}
        </p>
      </div>

      {going > 0 && problems === 0 && trainingGaps === 0 && (
        <p className="flex items-center gap-1.5 rounded-xl bg-mint p-3 text-sm font-semibold text-pine">
          <CircleCheck className="h-4 w-4 shrink-0" aria-hidden /> All set so far: forms{report.money ? ", slips and payments are" : " and slips are"} in.
        </p>
      )}

      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.kind}>
              <ReadyRowView row={r} eventId={report.eventId} canEmail={canEmail} />
            </li>
          ))}
        </ul>
      )}

      {training && (
        <div className="space-y-1.5 border-t border-line pt-3">
          <p className="text-xs font-bold text-navy">Overnight: trained adults going</p>
          {training.map((t) =>
            t.names.length ? (
              <p key={t.course} className="flex items-start gap-1.5 text-sm text-ink">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-pine" aria-hidden />
                <span>
                  <b>{t.label}:</b> {t.names.join(", ")}
                </span>
              </p>
            ) : (
              <p key={t.course} className="flex items-start gap-1.5 rounded-xl bg-danger-50 p-2.5 text-sm text-danger">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  <b>{t.label}:</b> nobody going has it current yet. At least one adult on the trip needs it.
                </span>
              </p>
            ),
          )}
        </div>
      )}
    </section>
  );
}

function ReadyRowView({ row, eventId, canEmail }: { row: ReadyRow; eventId: string; canEmail: boolean }) {
  const Icon = ICON[row.kind];
  const problem = row.families.length > 0;
  const tone = row.kind === "jobs" ? "text-gold-800" : problem ? "text-danger" : "text-pine";
  return (
    <details className="group rounded-xl border border-line bg-card">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <Icon className={`h-5 w-5 shrink-0 ${tone}`} aria-hidden />
        <span className="min-w-0 flex-1">
          <b className="block text-sm text-ink">{row.title}</b>
          <span className={`block text-xs ${problem ? tone : "text-muted"}`}>{row.summary}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-3 border-t border-line px-3 py-3">
        {row.jobs && (
          <ul className="space-y-1 text-sm">
            {row.jobs.map((j, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="text-ink">{j.title}</span>
                <span className="shrink-0 text-xs font-bold text-gold-800">{j.open} open</span>
              </li>
            ))}
          </ul>
        )}
        {problem && row.kind !== "jobs" && (
          <ul className="divide-y divide-line text-sm">
            {row.families.map((f) => (
              <li key={f.key} className="flex items-start justify-between gap-3 py-1.5">
                <span className="font-semibold text-ink">{f.name}</span>
                <span className="text-right text-xs text-muted">{f.detail}</span>
              </li>
            ))}
          </ul>
        )}
        {row.note && <p className="text-xs text-muted">{row.note}</p>}
        {problem &&
          (row.nextAt ? (
            <p className="flex items-start gap-1.5 rounded-lg bg-surface p-2.5 text-xs text-muted">
              <BellRing className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                Reminded {row.lastSent ? timeAgo(row.lastSent) : "recently"}. You can send it again after {fmtTime(row.nextAt)}.
              </span>
            </p>
          ) : (
            <ActionForm
              action={remindFamilies}
              submit={
                <>
                  <BellRing className="h-4 w-4" aria-hidden /> {BUTTON[row.kind]}
                </>
              }
              busy="Sending…"
              buttonClass="btn-primary w-full"
              confirm={`Send this to ${row.families.length} ${row.families.length === 1 ? "family" : "families"}?`}
              resetOnSuccess={false}
            >
              <input type="hidden" name="event_id" value={eventId} />
              <input type="hidden" name="kind" value={row.kind} />
              <label className="block space-y-1">
                <span className="text-xs font-bold text-navy">Message</span>
                <textarea name="message" rows={4} maxLength={300} defaultValue={row.message} className="input" />
              </label>
              {row.lastSent && <p className="text-[11px] text-muted">Last reminded {timeAgo(row.lastSent)}.</p>}
              {canEmail && (
                <label className="flex min-h-10 items-center gap-2 text-sm text-navy">
                  <input type="checkbox" name="email" value="on" className="h-4 w-4 accent-pine" /> Also email them (replies come to you)
                </label>
              )}
              <p className="text-[11px] text-muted">
                Goes as a phone alert to {row.families.length === 1 ? "this family" : `these ${row.families.length} families`} only.
              </p>
            </ActionForm>
          ))}
      </div>
    </details>
  );
}
