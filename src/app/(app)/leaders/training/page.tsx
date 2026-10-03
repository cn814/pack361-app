import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleAlert, CircleCheck, FileUp, ShieldCheck } from "lucide-react";
import BackLink from "@/components/BackLink";
import TrainingEditor, { STATE_STYLE } from "@/components/TrainingEditor";
import TrainingStatus, { MyScoutingLink } from "@/components/TrainingStatus";
import { isCommittee, isLeader, requireMember } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { TRAINING_IMPORT_DAYS, trainingImportDue } from "@/lib/training";
import { isAdmin } from "@/lib/advancement-data";
import { getLeaderTraining } from "@/lib/training-data";
import { COURSE_BY_KEY, POSITION_BY_KEY, isCurrent, trainedStatus, trainingState, type CourseKey } from "@/lib/training";

export const metadata: Metadata = { title: "Leader training" };

const SHOWN: CourseKey[] = ["ypt", "position", "hazardous_weather", "baloo"];

export default async function TrainingPage({ searchParams }: PageProps<"/leaders/training">) {
  const me = await requireMember();
  if (!isLeader(me)) redirect("/family");
  const admin = isAdmin(me);
  const canImport = isCommittee(me);
  const lastImport = (await getSettings()).training_last_import;
  const { show } = await searchParams;
  const gapsOnly = show === "gaps";
  const leaders = (await getLeaderTraining()).map((l) => ({ ...l, status: trainedStatus(l.positions, l.trainings) }));

  const has = (course: CourseKey) => leaders.filter((l) => isCurrent(l.trainings.find((t) => t.course === course)));
  const yptProblems = leaders.filter((l) => !isCurrent(l.trainings.find((t) => t.course === "ypt")));
  const baloo = has("baloo");
  const weather = has("hazardous_weather");
  const swim = has("safe_swim");
  const afloat = has("safety_afloat");
  const notTrained = leaders.filter((l) => !l.status.trained);

  const checklist = [
    {
      ok: yptProblems.length === 0,
      text: "Every leader has current Safeguarding Youth",
      detail: yptProblems.length ? `${yptProblems.length} not current` : `${leaders.length} of ${leaders.length}`,
    },
    {
      ok: baloo.length > 0,
      text: "At least one BALOO-trained adult (needed before any pack overnight)",
      detail: baloo.length ? `${baloo.length} trained` : "None recorded",
    },
    {
      ok: weather.length > 0,
      text: "Adults with current Hazardous Weather (one on every outing)",
      detail: weather.length ? `${weather.length} current` : "None recorded",
    },
    {
      ok: swim.length > 0 && afloat.length > 0,
      optional: true,
      text: "Safe Swim Defense and Safety Afloat, for swimming or boating events",
      detail: `${swim.length} Safe Swim · ${afloat.length} Safety Afloat`,
    },
  ];

  // Not trained first, then YPT problems, then by name
  const rank = (l: (typeof leaders)[number]) => {
    const s = trainingState(l.trainings.find((t) => t.course === "ypt"));
    return (l.status.trained ? 2 : 0) + (s === "expired" || s === "missing" ? 0 : 1);
  };
  const sorted = [...leaders]
    .filter((l) => !gapsOnly || !l.status.trained)
    .sort((a, b) => rank(a) - rank(b) || a.last_name.localeCompare(b.last_name));

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-bold ${active ? "bg-brand text-white" : "bg-card text-pine ring-1 ring-line"}`;

  return (
    <>
      <BackLink href={admin ? "/admin" : "/leaders"} label={admin ? "Pack admin" : "Leaders"} />
      <div className="space-y-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Leader training</h1>
        <p className="text-sm text-muted">
          To count as trained, every leader needs current Safeguarding Youth (renewed each year) plus the training for their
          position. Cubmasters and den leaders also need Hazardous Weather. Reminders go out 60, 30 and 7 days before
          anything expires, and on the day.
        </p>
        <p className={`text-xs ${trainingImportDue(lastImport) ? "font-semibold text-gold-800" : "text-muted"}`}>
          {lastImport
            ? `Last updated from my.scouting on ${new Date(lastImport).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" })}.`
            : "Not updated from my.scouting yet."}{" "}
          {trainingImportDue(lastImport) && `Import the training report every ${TRAINING_IMPORT_DAYS} days or so to keep this current.`}
        </p>
        {canImport && (
          <Link href="/leaders/training/import" className="btn-ghost py-2">
            <FileUp className="h-4 w-4" aria-hidden /> Import from my.scouting
          </Link>
        )}
      </div>

      <section className="card space-y-2">
        <h2 className="section-title">Pack checklist</h2>
        <ul className="space-y-2">
          {checklist.map((c) => (
            <li key={c.text} className="flex items-start gap-2 text-sm">
              {c.ok ? (
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-pine" aria-label="Done" />
              ) : (
                <CircleAlert className={`mt-0.5 h-4 w-4 shrink-0 ${c.optional ? "text-gold-700" : "text-danger"}`} aria-label="Not yet" />
              )}
              <span>
                <span className="font-semibold text-ink">
                  {c.text}
                  {c.optional && <span className="font-normal text-muted"> (when needed)</span>}
                </span>
                <span className="block text-xs text-muted">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">
          {notTrained.length === 0
            ? "Everyone listed is trained for their position."
            : `${notTrained.length} of ${leaders.length} not fully trained for their position.`}
        </p>
      </section>

      <nav className="flex gap-2" aria-label="Filter">
        <Link href="/leaders/training" className={chip(!gapsOnly)}>
          Everyone ({leaders.length})
        </Link>
        <Link href="/leaders/training?show=gaps" className={chip(gapsOnly)}>
          Not fully trained ({notTrained.length})
        </Link>
      </nav>

      {sorted.length === 0 && <p className="text-sm text-muted">Everyone is trained for their position.</p>}

      <ul className="page-wide space-y-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-2 lg:space-y-0">
        {sorted.map((l) => {
          const canEdit = admin || l.id === me.id;
          const focus = [...new Set([...l.status.required, ...l.positions.flatMap((p) => POSITION_BY_KEY[p].recommended), ...SHOWN])];
          const head = (
            <div className="space-y-1.5">
              <div>
                <p className="font-bold text-ink">
                  {l.preferred_name || l.first_name} {l.last_name}
                </p>
                <p className="truncate text-xs text-muted">{[l.position_title, ...l.dens].filter(Boolean).join(" · ") || "Leader"}</p>
              </div>
              <TrainingStatus status={l.status} compact rows={l.trainings} />
              <div className="flex flex-wrap gap-1">
                {SHOWN.map((k) => {
                  const s = trainingState(l.trainings.find((t) => t.course === k));
                  const c = COURSE_BY_KEY[k];
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
                  <div className="space-y-2 pt-2">
                    {admin && (
                      <p className="text-[11px] text-muted">
                        BSA member ID: {l.bsa_member_id ?? "not on file"}
                        {" · "}
                        <Link href={`/admin/adults/${l.id}`} className="font-bold text-pine underline">
                          Edit
                        </Link>
                      </p>
                    )}
                    <TrainingEditor adultId={l.id} rows={l.trainings} focus={focus} />
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
        my.scouting.org. <MyScoutingLink />
      </p>
    </>
  );
}
