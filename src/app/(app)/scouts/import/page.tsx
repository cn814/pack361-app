import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireMember } from "@/lib/data";
import { getLastImport, isAdmin } from "@/lib/advancement-data";
import { fmtDay, fmtTime } from "@/lib/format";
import ImportForm from "./ImportForm";
import ScoutbookSync from "./ScoutbookSync";
import { myScoutingConfigured } from "@/lib/myscouting";
import { getSettings } from "@/lib/settings";
import { weeklySummary, type WeeklyResult } from "@/lib/scoutbook-weekly";
import { changesText } from "@/lib/import-changes";

export const metadata: Metadata = { title: "Import from Scoutbook" };
// Reading every scout from Scoutbook can take a few minutes.
export const maxDuration = 300;

export default async function ImportPage() {
  const me = await requireMember();
  if (!isAdmin(me)) redirect("/scouts");
  const [last, settings] = await Promise.all([getLastImport(), getSettings()]);
  let weeklyLast: { at: string; lines: string[] } | null = null;
  try {
    const r = settings.scoutbook_weekly_last ? (JSON.parse(settings.scoutbook_weekly_last) as WeeklyResult) : null;
    if (r?.at) weeklyLast = { at: `${fmtDay(r.at)} at ${fmtTime(r.at)}`, lines: weeklySummary(r) };
  } catch {}

  return (
    <>
      <Link href="/scouts" className="inline-flex items-center gap-1 text-sm font-semibold text-pine">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Scouts
      </Link>
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Import from Scoutbook</h1>

      <section className="card space-y-2 text-sm text-navy">
        <h2 className="section-title">Get the file</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Open <b>Scoutbook Plus</b> (advancements.scouting.org) on a computer.
          </li>
          <li>
            Go to <b>Reports → Quick Export</b> and choose <b>Advancements</b>.
          </li>
          <li>Upload the CSV it downloads (Pack0361_Advancement_…csv) below.</li>
        </ol>
        <p className="text-xs text-muted">
          Each scout in the file is replaced with what Scoutbook says now. Scouts are matched by BSA member ID, so scouts
          missing an ID on the roster won&apos;t update.
        </p>
      </section>

      {last && (
        <p className="text-xs text-muted">
          Last import {fmtDay(last.imported_at)} at {fmtTime(last.imported_at)}: {last.row_count.toLocaleString()} records for{" "}
          {last.scout_count} scouts. {changesText(last.changes)}
          {last.unmatched.length > 0 &&
            ` Not on the app roster: ${last.unmatched.map((u) => `${u.name} (#${u.member_id})`).join(", ")}.`}
        </p>
      )}

      <ImportForm />
      <ScoutbookSync configured={myScoutingConfigured()} weekly={settings.scoutbook_weekly === "on"} weeklyLast={weeklyLast} />
    </>
  );
}
