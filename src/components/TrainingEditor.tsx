import ActionForm, { Field } from "@/components/ActionForm";
import { saveTraining } from "@/app/(app)/leaders/training/actions";
import { COURSES, daysLeft, trainingState, type Course, type CourseKey, type TrainingRow, type TrainingState } from "@/lib/training";
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

/**
 * Every tracked course for one adult, each with its own small form. Courses in `focus` (what
 * their positions need) come first; the rest sit under "More courses" unless they have a date.
 */
export default function TrainingEditor({ adultId, rows, focus }: { adultId: string; rows: TrainingRow[]; focus?: CourseKey[] }) {
  const shown = (c: Course) => !focus || focus.includes(c.key) || rows.some((r) => r.course === c.key);
  const main = COURSES.filter(shown);
  const more = COURSES.filter((c) => !shown(c));
  return (
    <div>
      <ul className="divide-y divide-line">
        {main.map((c) => (
          <CourseRow key={c.key} adultId={adultId} course={c} row={rows.find((r) => r.course === c.key)} />
        ))}
      </ul>
      {more.length > 0 && (
        <details className="border-t border-line pt-2">
          <summary className="cursor-pointer text-xs font-bold text-pine">More courses ({more.map((c) => c.short).join(", ")})</summary>
          <ul className="divide-y divide-line">
            {more.map((c) => (
              <CourseRow key={c.key} adultId={adultId} course={c} row={undefined} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function CourseRow({ adultId, course: c, row }: { adultId: string; course: Course; row: TrainingRow | undefined }) {
  const s = trainingState(row);
  return (
    <li className="py-2">
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
                <Field
                  label="Expires"
                  hint={`Blank = ${c.years} year${c.years === 1 ? "" : "s"} after finishing. Updates itself when you change the finish date.`}
                >
                  <input className="input py-2" type="date" name="expires_on" defaultValue={row?.expires_on ?? ""} />
                </Field>
              ) : (
                <p className="self-end pb-2 text-[11px] text-muted">Doesn&apos;t expire</p>
              )}
            </div>
            <p className="text-[11px] text-muted">
              {c.where === "my.scouting"
                ? "Find your dates at my.scouting.org → My Training."
                : "Use the date on your certification card."}{" "}
              Clear both dates and save to remove it.
            </p>
          </ActionForm>
        </div>
      </details>
    </li>
  );
}
