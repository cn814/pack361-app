import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import ReportTable, { ReportBar, ReportChips } from "@/components/ReportTable";
import { isLeader, requireMember } from "@/lib/data";
import { REPORTS, getTrainingReport } from "@/lib/reports";
import { COURSE_BY_KEY } from "@/lib/training";
import { fmtShortDate } from "@/lib/advancement";

export const metadata: Metadata = { title: "Training report" };

const MARK: Record<string, string> = { current: "", expiring: "Expiring ", expired: "Expired " };

/** Training: each leader's courses, when they expire, and what their position still needs. */
export default async function TrainingReportPage({ searchParams }: PageProps<"/leaders/reports/training">) {
  const me = await requireMember();
  if (!isLeader(me)) redirect("/");
  const sp = await searchParams;
  const { rows: all, columns } = await getTrainingReport();
  const needs = sp.show === "needs";
  const rows = needs ? all.filter((r) => r.missing.length) : all;

  return (
    <>
      <BackLink href="/lead#reports" label="Reports" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">{REPORTS.training.title}</h1>
      <p className="-mt-1 text-sm text-muted">
        {all.length - all.filter((r) => r.missing.length).length} of {all.length} leaders fully trained for their positions. Dates come from the
        my.scouting import (Leaders → People → Training). Each course shows when it expires, or when it was taken if it doesn&rsquo;t.
      </p>
      <ReportBar csv={REPORTS.training.csv}>
        <ReportChips
          items={[
            { href: "?show=all", label: "Everyone", on: !needs },
            { href: "?show=needs", label: "Still needs training", on: needs },
          ]}
        />
      </ReportBar>
      <ReportTable
        head={["Name", "Positions", "Still needs", ...columns.map((c) => COURSE_BY_KEY[c].short)]}
        rows={rows.map((r) => [
          r.name,
          r.positions || "None",
          r.missing.join(", ") || "Nothing",
          ...columns.map((c) => {
            const t = r.courses[c];
            if (!t || t.state === "missing") return "—";
            return t.expires_on ? `${MARK[t.state] ?? ""}${fmtShortDate(t.expires_on)}` : `Taken ${fmtShortDate(t.completed_on)}`;
          }),
        ])}
      />
    </>
  );
}
