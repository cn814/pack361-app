import ActionForm, { Field } from "@/components/ActionForm";
import { saveTraining } from "@/app/(app)/leaders/training/actions";
import { COURSES, daysLeft, trainingState, type TrainingRow, type TrainingState } from "@/lib/training";
import { fmtShortDate } from "@/lib/advancement";

export const STATE_STYLE: Record<TrainingState, string> = {
  current: "bg-mint text-pine",
  expiring: "bg-gold-50 text-gold-800",
  expired: "bg-danger-50 text-danger",
  missing: "bg-surface text-muted",
};

export function stateText(row: TrainingRow | undefined): string {
  const s = trainingState(row);
  if (s === "missing") return "Not recorded";
  if (!row?.expires_on) return `Done${row?.completed_on ? ` ${fmtShortDate(row.completed_on)}` : ""}`;
  const d = daysLeft(row.expires_on)!;
  if (s === "expired") return `Expired ${fmtShortDate(row.expires_on)}`;
  if (s === "expiring") return d === 0 ? "Expires today" : `Expires in ${d} day${d === 1 ? "" : "s"}`;
  return `Good through ${fmtShortDate(row.expires_on)}`;
}

/** Every tracked course for one adult, each with its own small form. */
export default function TrainingEditor({ adultId, rows, onlyRequired = false }: { adultId: string; rows: TrainingRow[]; onlyRequired?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {COURSES.filter((c) => !onlyRequired || c.required || rows.some((r) => r.course === c.key)).map((c) => {
        const row = rows.find((r) => r.course === c.key);
        const s = trainingState(row);
        return (
          <li key={c.key} className="py-2">
            <details>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{c.label}</span>
                  <span className="block text-[11px] text-muted">{c.who}</span>
                </span>
                <span className={`badge shrink-0 normal-case tracking-normal ${STATE_STYLE[s]}`}>{stateText(row)}</span>
              </summary>
              <div className="pt-2">
                <ActionForm action={saveTraining} className="space-y-2" buttonClass="btn-ghost w-full py-2">
                  <input type="hidden" name="adult_id" value={adultId} />
                  <input type="hidden" name="course" value={c.key} />
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Finished on">
                      <input className="input py-2" type="date" name="completed_on" defaultValue={row?.completed_on ?? ""} />
                    </Field>
                    {c.years ? (
                      <Field label="Expires" hint={`Blank = ${c.years} years after finishing`}>
                        <input className="input py-2" type="date" name="expires_on" defaultValue={row?.expires_on ?? ""} />
                      </Field>
                    ) : (
                      <p className="self-end pb-2 text-[11px] text-muted">Doesn&apos;t expire</p>
                    )}
                  </div>
                  <p className="text-[11px] text-muted">
                    Find your dates at my.scouting.org → My Training. Clear both dates and save to remove it.
                  </p>
                </ActionForm>
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
