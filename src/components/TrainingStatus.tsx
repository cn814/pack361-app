import { CircleAlert, Clock, ExternalLink, ShieldCheck } from "lucide-react";
import { COURSE_BY_KEY, MY_SCOUTING_URL, daysLeft, positionLabels, trainingState, type TrainedStatus, type TrainingRow } from "@/lib/training";
import { fmtShortDate } from "@/lib/advancement";

/** Courses on record that have expired or expire within 60 days, soonest first. */
function DueSoon({ rows }: { rows: TrainingRow[] }) {
  const due = rows
    .filter((r) => ["expiring", "expired"].includes(trainingState(r)) && COURSE_BY_KEY[r.course])
    .sort((a, b) => (a.expires_on ?? "").localeCompare(b.expires_on ?? ""));
  if (!due.length) return null;
  return (
    <div className="flex items-start gap-1.5 text-xs text-gold-800">
      <Clock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <ul className="min-w-0 space-y-0.5">
        {due.map((r) => {
          const d = daysLeft(r.expires_on)!;
          return (
            <li key={r.course}>
              <b>{COURSE_BY_KEY[r.course].label}</b>{" "}
              {d < 0 ? `expired ${fmtShortDate(r.expires_on)}` : d === 0 ? "expires today" : `expires ${fmtShortDate(r.expires_on)} (${d} day${d === 1 ? "" : "s"})`}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function MyScoutingLink({ className = "" }: { className?: string }) {
  return (
    <a
      href={MY_SCOUTING_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 font-bold text-pine underline ${className}`}
    >
      Open my.scouting <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );
}

/** "Trained for Den Leader" or "Missing: Hazardous Weather", with where to take the courses. */
export default function TrainingStatus({ status, compact = false, rows }: { status: TrainedStatus; compact?: boolean; rows?: TrainingRow[] }) {
  const due = rows ? <DueSoon rows={rows} /> : null;
  return (
    <div className="space-y-1.5">
      {due}
      <Status status={status} compact={compact} />
    </div>
  );
}

function Status({ status, compact }: { status: TrainedStatus; compact: boolean }) {
  const who = status.positions.length ? positionLabels(status.positions) : "a registered adult";
  if (status.trained) {
    return (
      <p className="flex items-start gap-1.5 text-xs font-semibold text-pine">
        <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Trained for {who}
          {!compact && status.suggested.length > 0 && (
            <span className="block font-normal text-muted">
              Also good to have: {status.suggested.map((c) => COURSE_BY_KEY[c].label).join(", ")}
            </span>
          )}
        </span>
      </p>
    );
  }
  const online = status.missing.some((c) => COURSE_BY_KEY[c].where === "my.scouting");
  return (
    <div className="flex items-start gap-1.5 text-xs text-danger">
      <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">Missing: {status.missing.map((c) => COURSE_BY_KEY[c].label).join(", ")}</p>
        {!compact && status.positions.length > 0 && <p className="text-muted">Needed to be trained for {who}.</p>}
        {online && (
          <p className="text-muted">
            {status.missing.length === 1 ? "Take it" : "Take them"} at my.scouting.org, then add the date below. <MyScoutingLink />
          </p>
        )}
      </div>
    </div>
  );
}
