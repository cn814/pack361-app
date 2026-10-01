import { CircleAlert, ExternalLink, ShieldCheck } from "lucide-react";
import { COURSE_BY_KEY, MY_SCOUTING_URL, positionLabels, type TrainedStatus } from "@/lib/training";

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
export default function TrainingStatus({ status, compact = false }: { status: TrainedStatus; compact?: boolean }) {
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
            Safeguarding Youth and the other courses are taken at my.scouting.org. <MyScoutingLink />
          </p>
        )}
      </div>
    </div>
  );
}
