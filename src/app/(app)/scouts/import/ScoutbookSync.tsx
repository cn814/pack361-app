"use client";

import { useState, useTransition } from "react";
import { CalendarClock, CircleCheck, CloudDownload, GitCompare } from "lucide-react";
import { compareScoutbook, importFromScoutbook, setScoutbookWeekly, type ImportState, type ScoutbookCompareState } from "../actions";
import { changesText } from "@/lib/import-changes";
import { failedCallMessage } from "@/components/ActionForm";

type ImportRes = ImportState & { steps?: string[]; skipped?: { name: string; reason: string }[] };

const KIND: Record<string, string> = { rank: "Ranks", adventure: "Adventures", requirement: "Requirements", award: "Awards" };

/** Read advancement straight from Scoutbook (experimental): compare first, then import. */
export default function ScoutbookSync({
  configured,
  weekly,
  weeklyLast,
}: {
  configured: boolean;
  weekly: boolean;
  weeklyLast: { at: string; lines: string[] } | null;
}) {
  const [saving, startSaving] = useTransition();
  const [weeklyOn, setWeeklyOn] = useState(weekly);
  const [busy, setBusy] = useState<"compare" | "import" | null>(null);
  const [cmp, setCmp] = useState<ScoutbookCompareState | null>(null);
  const [imp, setImp] = useState<ImportRes | null>(null);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);

  if (!configured) {
    return (
      <section className="card space-y-1 text-sm text-navy">
        <h2 className="section-title">Straight from Scoutbook (experimental)</h2>
        <p className="text-xs text-muted">
          Not set up: add <b>MYSCOUTING_USERNAME</b> and <b>MYSCOUTING_PASSWORD</b> in Vercel, then redeploy.
        </p>
      </section>
    );
  }

  const steps = (list?: string[], skipped?: { name: string; reason: string }[]) => (
    <ul className="list-disc pl-5 text-xs">
      {list?.map((s, i) => <li key={i}>{s}</li>)}
      {skipped?.map((s) => (
        <li key={s.name} className="text-gold-800">
          Skipped {s.name}: {s.reason}
        </li>
      ))}
    </ul>
  );

  return (
    <section className="card space-y-3 text-sm text-navy">
      <div>
        <h2 className="section-title">Straight from Scoutbook (experimental)</h2>
        <p className="mt-1">
          Reads every scout&apos;s advancement from Scoutbook with the pack&apos;s saved login, instead of a file. It takes up to
          a few minutes. <b>Compare</b> shows what would change and saves nothing; <b>Import</b> saves it, like uploading the
          export. A scout Scoutbook doesn&apos;t answer for is skipped and keeps their records.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-ghost flex-1"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("compare");
            setImp(null);
            try {
              setCmp(await compareScoutbook());
            } catch (e) {
              setCmp({ error: failedCallMessage(e, "Compare"), steps: [], skipped: [] });
            } finally {
              setBusy(null);
            }
          }}
        >
          <GitCompare className="h-4 w-4" aria-hidden /> {busy === "compare" ? "Reading Scoutbook…" : "Compare with Scoutbook"}
        </button>
        <button
          type="button"
          className="btn-primary flex-1"
          disabled={busy !== null || !cmp?.compare}
          title={cmp?.compare ? undefined : "Compare first"}
          onClick={async () => {
            setBusy("import");
            try {
              setImp(await importFromScoutbook());
            } catch (e) {
              // The import may have finished on the server even though the answer didn't
              // arrive; comparing again shows where things stand.
              setImp({ error: `${failedCallMessage(e, "Compare")} If the import got through, Compare will show nothing new.` });
            } finally {
              setBusy(null);
            }
          }}
        >
          <CloudDownload className="h-4 w-4" aria-hidden /> {busy === "import" ? "Importing…" : "Import from Scoutbook"}
        </button>
      </div>

      <div className="space-y-1.5 rounded-xl bg-surface-low p-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 shrink-0 text-pine" aria-hidden />
          <p className="flex-1 font-bold">Every Sunday night</p>
          <button
            type="button"
            role="switch"
            aria-checked={weeklyOn}
            disabled={saving}
            onClick={() =>
              startSaving(async () => {
                const next = !weeklyOn;
                setWeeklyError(null);
                try {
                  const res = await setScoutbookWeekly(next);
                  if (res.ok) setWeeklyOn(next);
                  else setWeeklyError(res.error ?? "Couldn't change it. Try again.");
                } catch (e) {
                  setWeeklyError(failedCallMessage(e, weeklyOn ? "On" : "Off"));
                }
              })
            }
            className={`rounded-full px-3 py-1 text-xs font-extrabold ${weeklyOn ? "bg-brand text-white" : "border border-line bg-card text-muted"}`}
          >
            {weeklyOn ? "On" : "Off"}
          </button>
        </div>
        <p className="text-xs text-muted">
          Imports advancement and Safeguarding Youth dates from Scoutbook automatically before the Sunday email. Pack admins
          get a note when something changed. If it would remove more than a few records it holds off and asks you to look.
        </p>
        {weeklyError && <p className="text-xs font-semibold text-danger">{weeklyError}</p>}
        {weeklyLast && (
          <div className="text-xs">
            <p className="font-semibold">Last run {weeklyLast.at}:</p>
            {weeklyLast.lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
        )}
      </div>

      {cmp && !imp && (
        <div className="space-y-2">
          {steps(cmp.steps, cmp.skipped)}
          {cmp.error && <p className="text-xs font-semibold text-danger">{cmp.error}</p>}
          {cmp.compare && (
            <>
              <p className="font-semibold">
                {cmp.compare.scoutsMatched} scouts matched. Compared with the app now: {cmp.compare.same.toLocaleString()} the same,{" "}
                {cmp.compare.new.toLocaleString()} new, {cmp.compare.changed.toLocaleString()} updated,{" "}
                {cmp.compare.removed.toLocaleString()} would be removed.
                {cmp.compare.notOnRoster ? ` ${cmp.compare.notOnRoster} scouts in Scoutbook aren't on the app roster.` : ""}
              </p>
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[30rem] text-left text-xs">
                  <thead className="text-muted">
                    <tr>
                      <th className="p-1">Kind</th>
                      <th className="p-1">Version</th>
                      <th className="p-1">Same</th>
                      <th className="p-1">New</th>
                      <th className="p-1">Updated</th>
                      <th className="p-1">Removed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {cmp.compare.groups.map((g) => (
                      <tr key={g.kind + g.version} className="align-top">
                        <td className="p-1">{KIND[g.kind] ?? g.kind}</td>
                        <td className="p-1">{g.version || "–"}</td>
                        <td className="p-1">{g.same}</td>
                        <td className="p-1">
                          {g.new}
                          {g.newExamples.length > 0 && <span className="block text-[11px] text-muted">{g.newExamples.join("; ")}</span>}
                        </td>
                        <td className="p-1">{g.changed}</td>
                        <td className="p-1">
                          {g.removed}
                          {g.removedExamples.length > 0 && <span className="block text-[11px] text-muted">{g.removedExamples.join("; ")}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {imp && (
        <div className="space-y-1">
          {steps(imp.steps, imp.skipped)}
          {imp.error && <p className="text-xs font-semibold text-danger">{imp.error}</p>}
          {imp.ok && (
            <div className="space-y-1 rounded-xl bg-mint p-3 text-pine">
              <p className="flex items-center gap-1.5 font-bold">
                <CircleCheck className="h-4 w-4" aria-hidden /> Imported {imp.rows?.toLocaleString()} records for {imp.scouts} scouts.
              </p>
              {changesText(imp.changes) && <p className="font-semibold">{changesText(imp.changes)}</p>}
              {!!imp.unmatched?.length && (
                <p className="text-xs text-navy">
                  Not on the app roster (no matching member ID): {imp.unmatched.map((u) => `${u.name} (#${u.member_id})`).join(", ")}. Add
                  them, or their member ID, under Pack admin → Families and scouts.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
