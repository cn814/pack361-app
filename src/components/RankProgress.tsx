import { Award, CircleCheck, CircleDashed, Circle, Hourglass } from "lucide-react";
import { ELECTIVES_NEEDED, RANK_LABEL, fmtShortDate, type AdventureProgress, type RankProgress } from "@/lib/advancement";

/** Horizontal progress bar with the rank's color accents. */
export function ProgressBar({ percent, className = "" }: { percent: number; className?: string }) {
  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full bg-surface ${className}`}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-full ${percent >= 100 ? "bg-gold" : "bg-pine"}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

export function ProgressSummary({ p }: { p: RankProgress }) {
  if (p.earned) {
    return (
      <p className="flex items-center gap-1.5 text-sm font-semibold text-pine">
        <Award className="h-4 w-4 text-gold-700" aria-hidden /> {RANK_LABEL[p.rank]} rank earned {fmtShortDate(p.earned.completed_on)}
      </p>
    );
  }
  return (
    <p className="text-xs text-muted">
      <b className="text-ink">{p.requiredDone}</b> of {p.required.length} required ·{" "}
      <b className="text-ink">{p.electivesDone}</b> of {ELECTIVES_NEEDED} electives
    </p>
  );
}

function AdventureRow({ a }: { a: AdventureProgress }) {
  const Icon = a.done ? CircleCheck : a.reqsDone > 0 ? CircleDashed : Circle;
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${a.done ? "text-pine" : a.reqsDone ? "text-gold-700" : "text-outline"}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-tight text-ink">
          {a.name}
          {a.special && <span className="ml-1 text-[11px] font-normal text-muted">(at council events)</span>}
        </p>
        {a.done ? (
          <p className="text-xs text-muted">
            Finished {fmtShortDate(a.completedOn)}
            {!a.approved && (
              <span className="ml-1 inline-flex items-center gap-0.5 text-gold-800">
                <Hourglass className="h-3 w-3" aria-hidden /> waiting for leader approval
              </span>
            )}
          </p>
        ) : (
          <p className="text-xs text-muted">
            {a.reqsDone ? `${a.reqsDone} of ${a.reqCount} requirements` : `${a.reqCount} requirements`}
          </p>
        )}
      </div>
      {!a.done && a.reqsDone > 0 && (
        <span className="mt-1 w-14 shrink-0">
          <ProgressBar percent={Math.round((a.reqsDone / a.reqCount) * 100)} className="h-1.5" />
        </span>
      )}
    </li>
  );
}

export function AdventureList({ items, empty }: { items: AdventureProgress[]; empty?: string }) {
  if (!items.length) return <p className="py-2 text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((a) => (
        <AdventureRow key={a.name} a={a} />
      ))}
    </ul>
  );
}
