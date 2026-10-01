import { CircleAlert, Clock, ExternalLink, ShieldCheck } from "lucide-react";
import {
  COURSE_BY_KEY,
  MY_SCOUTING_URL,
  POSITION_BY_KEY,
  daysLeft,
  positionLabels,
  positionTraining,
  trainingState,
  type CourseKey,
  type TrainedStatus,
  type TrainingRow,
} from "@/lib/training";
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
  // "Position-specific training" is a different set of short online modules for each position:
  // say which positions, and what's in each.
  const modulePositions = status.positions.filter((p) => status.missing.some((c) => (c === "position" || c === "cor") && POSITION_BY_KEY[p].required.includes(c)));
  const label = (c: CourseKey) => {
    if (c !== "position") return COURSE_BY_KEY[c].label;
    const names = modulePositions.filter((p) => p !== "cor").map((p) => POSITION_BY_KEY[p].label);
    return names.length ? `${names.join(" and ")} position training` : COURSE_BY_KEY[c].label;
  };
  const sets = modulePositions.map(positionTraining);
  return (
    <div className="flex items-start gap-1.5 text-xs text-danger">
      <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="font-semibold">Missing: {status.missing.map(label).join(", ")}</p>
        {compact
          ? sets.map((t) => (
              <p key={t.position} className="text-muted">
                {t.label}: {t.modules.length} short online modules, about {t.minutes} minutes
              </p>
            ))
          : sets.map((t) => (
              <div key={t.position} className="rounded-lg bg-surface-low p-2 text-ink">
                <p className="font-semibold">
                  {t.label} training: {t.modules.length} short videos, about {t.minutes} minutes in all
                </p>
                <p className="text-muted">
                  In the Learn Center at my.scouting.org, search for each code. You&apos;re
                  trained for the position when all of them are done.
                </p>
                <ul className="mt-1 grid gap-x-3 gap-y-0.5 sm:grid-cols-2">
                  {t.modules.map((m) => (
                    <li key={m.code}>
                      <span className="font-mono text-[11px] text-muted">{m.code}</span> {m.title}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        {!compact && status.positions.length > 0 && <p className="text-muted">Needed to be trained for {who}.</p>}
        {online && !compact && (
          <p className="text-muted">
            When you&apos;re done, add the date you finished below. <MyScoutingLink />
          </p>
        )}
      </div>
    </div>
  );
}
