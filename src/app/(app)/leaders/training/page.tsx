import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import BackLink from "@/components/BackLink";
import TrainingEditor, { STATE_STYLE } from "@/components/TrainingEditor";
import { isLeader, requireMember } from "@/lib/data";
import { isAdmin } from "@/lib/advancement-data";
import { getLeaderTraining } from "@/lib/training-data";
import { COURSES, trainingState, type CourseKey } from "@/lib/training";

export const metadata: Metadata = { title: "Leader training" };

const SHOWN: CourseKey[] = ["ypt", "position", "hazardous_weather", "baloo"];

export default async function TrainingPage() {
  const me = await requireMember();
  if (!isLeader(me)) redirect("/family");
  const admin = isAdmin(me);
  const leaders = await getLeaderTraining();

  const count = (course: CourseKey, ok: (s: ReturnType<typeof trainingState>) => boolean) =>
    leaders.filter((l) => ok(trainingState(l.trainings.find((t) => t.course === course)))).length;
  const yptProblems = count("ypt", (s) => s !== "current");
  const campoutReady = count("baloo", (s) => s === "current" || s === "expiring");
  const weatherReady = count("hazardous_weather", (s) => s === "current" || s === "expiring");

  // Problems first, then by name
  const rank = (l: (typeof leaders)[number]) => {
    const s = trainingState(l.trainings.find((t) => t.course === "ypt"));
    return s === "expired" || s === "missing" ? 0 : s === "expiring" ? 1 : 2;
  };
  const sorted = [...leaders].sort((a, b) => rank(a) - rank(b) || a.last_name.localeCompare(b.last_name));

  return (
    <>
      <BackLink href={admin ? "/admin" : "/leaders"} label={admin ? "Pack admin" : "Leaders"} />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Leader training</h1>
        <p className="text-sm text-muted">
          Registered leaders need current Safeguarding Youth (YPT) training. Leaders get a reminder 60, 30 and 7 days before it
          expires.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="card px-2 py-3">
          <p className={`text-2xl font-extrabold ${yptProblems ? "text-danger" : "text-pine"}`}>{yptProblems}</p>
          <p className="text-[11px] text-muted">YPT expired, due or missing</p>
        </div>
        <div className="card px-2 py-3">
          <p className={`text-2xl font-extrabold ${campoutReady ? "text-pine" : "text-danger"}`}>{campoutReady}</p>
          <p className="text-[11px] text-muted">BALOO trained (needed for campouts)</p>
        </div>
        <div className="card px-2 py-3">
          <p className={`text-2xl font-extrabold ${weatherReady ? "text-pine" : "text-danger"}`}>{weatherReady}</p>
          <p className="text-[11px] text-muted">Hazardous Weather current</p>
        </div>
      </div>

      <ul className="space-y-2">
        {sorted.map((l) => {
          const canEdit = admin || l.id === me.id;
          const head = (
            <div className="space-y-1.5">
              <div>
                <p className="font-bold text-ink">
                  {l.preferred_name || l.first_name} {l.last_name}
                </p>
                <p className="truncate text-xs text-muted">{[l.position_title, ...l.dens].filter(Boolean).join(" · ") || "Leader"}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {SHOWN.map((k) => {
                  const s = trainingState(l.trainings.find((t) => t.course === k));
                  const c = COURSES.find((x) => x.key === k)!;
                  return (
                    <span key={k} className={`badge normal-case tracking-normal ${STATE_STYLE[s]}`} title={`${c.label}: ${s}`}>
                      {s === "current" && <ShieldCheck className="h-3 w-3" aria-hidden />}
                      {c.short}
                      {s !== "current" && <span className="font-semibold">· {s === "missing" ? "none" : s}</span>}
                    </span>
                  );
                })}
              </div>
            </div>
          );
          return (
            <li key={l.id} className="card py-3">
              {canEdit ? (
                <details>
                  <summary className="cursor-pointer list-none">{head}</summary>
                  <div className="pt-2">
                    <TrainingEditor adultId={l.id} rows={l.trainings} />
                  </div>
                </details>
              ) : (
                head
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-center text-[11px] text-muted">
        {admin ? "Tap a leader to update their dates." : "Tap your own name to update your dates."} Official records are in
        my.scouting.org.
      </p>
    </>
  );
}
