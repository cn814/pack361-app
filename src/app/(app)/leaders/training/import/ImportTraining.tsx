"use client";

import { useMemo, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck } from "lucide-react";
import { applyTrainingImport, fetchFromMyScouting, type ImportResult } from "../actions";
import { fmtShortDate } from "@/lib/advancement";
import { failedCallMessage } from "@/components/ActionForm";
import { COURSE_BY_KEY, type TrainingRow } from "@/lib/training";
import { IMPORT_MAX, buildPlan, csvTable, parseReport, type Cell, type ParsedReport, type RosterAdult } from "@/lib/training-import";

function shown(completed: string | null, expires: string | null): string {
  if (!completed && !expires) return "Nothing";
  return [completed ? `Finished ${fmtShortDate(completed)}` : "", expires ? `expires ${fmtShortDate(expires)}` : ""]
    .filter(Boolean)
    .join(" · ");
}

const currentText = (row: TrainingRow | undefined) => (row ? shown(row.completed_on, row.expires_on) : "Nothing");

/** Read the file in the browser. Only the matched updates are sent to the server. */
async function readTable(file: File): Promise<Cell[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    return (await readSheet(file)) as unknown as Cell[][];
  }
  if (name.endsWith(".xls")) throw new Error("This is an old Excel file. Open it and save it as .xlsx or CSV, then try again.");
  return csvTable(await file.text());
}

export default function ImportTraining({ roster, today, liveSync = false }: { roster: RosterAdult[]; today: string; liveSync?: boolean }) {
  const router = useRouter();
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [fileError, setFileError] = useState("");
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [skipIds, setSkipIds] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [syncSteps, setSyncSteps] = useState<string[]>([]);
  const [syncing, startSync] = useTransition();

  const plan = useMemo(() => (report ? buildPlan(report.rows, roster, today) : null), [report, roster, today]);
  const chosen = plan ? plan.updates.filter((u) => !skip.has(u.key)) : [];
  const chosenIds = plan ? plan.memberIdOffers.filter((o) => !skipIds.has(o.adultId)) : [];

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setResult(null);
    setFileError("");
    setReport(null);
    if (!file) return;
    try {
      const parsed = parseReport(await readTable(file));
      if (parsed.error) setFileError(parsed.error);
      else if (!parsed.rows.length) setFileError("No training rows with dates were found in that file.");
      else load(parsed);
    } catch (err) {
      setFileError(err instanceof Error && err.message.startsWith("This is") ? err.message : "Couldn't read that file. Upload the CSV or .xlsx export.");
    }
  }

  function load(parsed: ParsedReport) {
    setReport(parsed);
    // Rows matched by member ID whose name doesn't match start unticked.
    const p = buildPlan(parsed.rows, roster, today);
    setSkip(new Set(p.updates.filter((u) => u.warn).map((u) => u.key)));
    setSkipIds(new Set());
  }

  function getFromMyScouting() {
    setResult(null);
    setFileError("");
    setReport(null);
    setSyncSteps([]);
    startSync(async () => {
      let res: Awaited<ReturnType<typeof fetchFromMyScouting>>;
      try {
        res = await fetchFromMyScouting();
      } catch (e) {
        setFileError(failedCallMessage(e, "Get training from my.scouting"));
        return;
      }
      setSyncSteps(res.steps);
      if (res.error) setFileError(res.error);
      else if (!res.rows.length) setFileError("my.scouting didn't return any training dates.");
      else load({ rows: res.rows, columns: [], yptOnly: false });
    });
  }

  function apply() {
    const payload = {
      // Only IDs, course keys, dates and member IDs: no names, emails or other report columns.
      rows: chosen.map((u) => ({ adult_id: u.adultId, course: u.course, completed_on: u.completed, expires_on: u.expires })),
      memberIds: chosenIds.map((o) => ({ adult_id: o.adultId, member_id: o.memberId })),
      // A flagged row you ticked: remember the report's name for this adult next time.
      names: chosen.filter((u) => u.warn && u.reportName).map((u) => ({ adult_id: u.adultId, name: u.reportName })),
    };
    startTransition(async () => {
      let res: ImportResult;
      try {
        res = await applyTrainingImport(payload);
      } catch (e) {
        // The preview stays, so tapping Apply again sends the same updates.
        res = { error: failedCallMessage(e, "Apply") };
      }
      setResult(res);
      if (res.ok) {
        setReport(null);
        router.refresh();
      }
    });
  }

  const toggle = (set: Set<string>, key: string, update: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    update(next);
  };

  return (
    <div className="space-y-3">
      {liveSync && (
        <section className="card space-y-2 border-l-4 border-l-gold">
          <h2 className="font-extrabold text-pine-950">Get it straight from my.scouting (experimental)</h2>
          <p className="text-xs text-muted">
            Signs in to my.scouting with the pack&apos;s saved login and reads everyone&apos;s training, instead of a file. It uses
            Scoutbook&apos;s unofficial connection, so it may stop working when Scouting America changes things; the file upload
            below always works. You&apos;ll see every change before anything is saved.
          </p>
          <button type="button" className="btn-primary w-full py-2" onClick={getFromMyScouting} disabled={syncing}>
            {syncing ? "Reading my.scouting… (up to a minute)" : "Get training from my.scouting"}
          </button>
          {syncSteps.length > 0 && (
            <ul className="space-y-0.5 text-xs text-ink">
              {syncSteps.map((s) => (
                <li key={s} className="flex items-start gap-1.5">
                  <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pine" aria-hidden /> {s}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <label className="card block space-y-1">
        <span className="block text-xs font-bold text-navy">Training report from my.scouting (.csv or .xlsx)</span>
        <input
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={onFile}
          className="input py-2 text-sm"
        />
        <span className="block text-[11px] text-muted">The file is read on this device and isn&apos;t uploaded or saved.</span>
      </label>

      {fileError && <p className="text-sm font-semibold text-danger">{fileError}</p>}

      {result?.ok && (
        <p className="flex items-center gap-1.5 rounded-xl bg-mint p-3 text-sm font-bold text-pine">
          <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />
          Updated {result.trainings} training{result.trainings === 1 ? "" : "s"} for {result.adults} adult{result.adults === 1 ? "" : "s"}.
          {result.memberIds ? ` Saved ${result.memberIds} member ID${result.memberIds === 1 ? "" : "s"}.` : ""}
        </p>
      )}
      {result?.error && <p className="text-sm font-semibold text-danger">{result.error}</p>}

      {report && plan && (
        <>
          <section className="card space-y-2">
            <h2 className="section-title">Preview</h2>
            <p className="text-sm text-navy">
              {report.rows.length} training row{report.rows.length === 1 ? "" : "s"} read
              {report.yptOnly ? " (Safeguarding Youth report)" : ""}. {plan.updates.length} update
              {plan.updates.length === 1 ? "" : "s"}; {plan.upToDate} already up to date in the app.
            </p>
            <p className="text-[11px] text-muted">Columns used: {report.columns.join(", ")}. Everything else in the file is ignored.</p>
            {report.status && (
              <div className="space-y-1.5 rounded-xl bg-gold-50 p-2.5 text-xs text-gold-800">
                <p>
                  <b>Trained Leaders Status report.</b> It says who&apos;s trained but has no completion dates, so it can only
                  record <b>position training</b> as done (dated {report.status.asOf}) for people the app has nothing for yet.
                  For Safeguarding Youth and Hazardous Weather dates, also upload the <b>Safeguarding Youth Training Report</b>.
                </p>
                {report.status.stillNeeded.length > 0 && (
                  <>
                    <p className="font-bold">my.scouting says still needed:</p>
                    <ul className="list-disc space-y-0.5 pl-4">
                      {report.status.stillNeeded.map((n) => (
                        <li key={n.name}>
                          <b>{n.name}</b>: {n.needs.join(", ")}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            {plan.updates.length > 0 && (
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-xs">
                  <thead className="text-muted">
                    <tr>
                      <th className="p-1">
                        <span className="sr-only">Apply</span>
                      </th>
                      <th className="p-1">Adult</th>
                      <th className="p-1">Course</th>
                      <th className="p-1">In the app now</th>
                      <th className="p-1">From the report</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {plan.updates.map((u) => (
                      <tr key={u.key} className="align-top">
                        <td className="p-1">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-pine"
                            checked={!skip.has(u.key)}
                            onChange={() => toggle(skip, u.key, setSkip)}
                            aria-label={`Apply ${COURSE_BY_KEY[u.course].label} for ${u.adultName}`}
                          />
                        </td>
                        <td className="p-1">
                          <span className="font-semibold text-ink">{u.adultName}</span>
                          <span className="block text-[11px] text-muted">{u.via === "id" ? "by member ID" : "by name"}</span>
                          {u.warn && (
                            <span className="flex items-center gap-1 text-[11px] font-semibold text-gold-700">
                              <CircleAlert className="h-3 w-3" aria-hidden /> {u.warn}
                            </span>
                          )}
                          {u.warn && <span className="block text-[11px] text-muted">Tick it if it&apos;s the same person; the app will remember.</span>}
                        </td>
                        <td className="p-1">{COURSE_BY_KEY[u.course].label}</td>
                        <td className="p-1 text-muted">{currentText(u.current)}</td>
                        <td className="p-1 font-semibold text-pine">{shown(u.completed, u.expires)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {plan.memberIdOffers.length > 0 && (
              <div className="space-y-1 rounded-xl bg-surface-low p-2">
                <p className="text-xs font-bold text-navy">Save member IDs from the report (matched by name, no ID in the app yet)</p>
                {plan.memberIdOffers.map((o) => (
                  <label key={o.adultId} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-pine"
                      checked={!skipIds.has(o.adultId)}
                      onChange={() => toggle(skipIds, o.adultId, setSkipIds)}
                    />
                    <span>
                      {o.adultName}: <span className="font-semibold">{o.memberId}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}

            <button
              type="button"
              className={`btn-primary w-full ${pending ? "is-busy" : ""}`}
              disabled={pending || (!chosen.length && !chosenIds.length) || chosen.length > IMPORT_MAX}
              onClick={apply}
            >
              {pending
                ? "Applying…"
                : chosen.length > IMPORT_MAX
                  ? `Too many rows (at most ${IMPORT_MAX}); split the report`
                  : `Apply ${chosen.length} update${chosen.length === 1 ? "" : "s"}${chosenIds.length ? ` and ${chosenIds.length} member ID${chosenIds.length === 1 ? "" : "s"}` : ""}`}
            </button>
          </section>

          {plan.unmatched.length > 0 && (
            <section className="card space-y-1">
              <h2 className="section-title">Not matched ({plan.unmatched.reduce((n, u) => n + u.rows, 0)} rows)</h2>
              <p className="text-[11px] text-muted">
                Add their BSA member ID in Pack admin (or ask them to add it under Me → My training), then import again.
              </p>
              <ul className="divide-y divide-line text-xs">
                {plan.unmatched.map((u) => (
                  <li key={u.label + u.reason} className="py-1">
                    <span className="font-semibold text-ink">{u.label}</span>
                    <span className="text-muted">
                      {" "}
                      · {u.reason}
                      {u.rows > 1 ? ` (${u.rows} rows)` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {plan.unknownCourses.length > 0 && (
            <section className="card space-y-1">
              <h2 className="section-title">Courses the app doesn&apos;t track</h2>
              <ul className="text-xs text-muted">
                {plan.unknownCourses.map((c) => (
                  <li key={c.text}>
                    {c.text} ({c.rows})
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
