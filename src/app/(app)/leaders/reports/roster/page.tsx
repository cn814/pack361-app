import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import ReportTable, { ReportBar, ReportChips } from "@/components/ReportTable";
import { requireMember } from "@/lib/data";
import { REPORTS, getRosterReport } from "@/lib/reports";
import { ROLE_LABEL } from "@/lib/roster-data";
import { regStatus } from "@/lib/registration";
import { fmtShortDate } from "@/lib/advancement";
import type { AppRole } from "@/lib/types";

export const metadata: Metadata = { title: "Roster report" };

const SHOW = { active: "Registered now", former: "Left (last 2 years)", all: "Everyone" } as const;
type Show = keyof typeof SHOW;

/** Roster report: everyone registered, and everyone who left in the last two years. */
export default async function RosterReportPage({ searchParams }: PageProps<"/leaders/reports/roster">) {
  await requireMember();
  const all = await getRosterReport();
  if (!all) redirect("/lead#reports");
  const sp = await searchParams;
  const show: Show = typeof sp.show === "string" && sp.show in SHOW ? (sp.show as Show) : "active";
  const rows = all.filter((r) => (show === "all" ? true : show === "active" ? r.active : !r.active));
  const scouts = all.filter((r) => r.active && r.person === "Scout").length;
  const adults = all.filter((r) => r.active && r.person === "Adult").length;

  return (
    <>
      <BackLink href="/lead#reports" label="Reports" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">{REPORTS.roster.title}</h1>
      <p className="-mt-1 text-sm text-muted">
        {scouts} scouts and {adults} adults now, plus {all.length - scouts - adults} who left in the last two years. Leaving dates are kept
        from October 2026 on. Addresses and birthdates are in Scoutbook.
      </p>
      <ReportBar csv={REPORTS.roster.csv}>
        <ReportChips items={(Object.keys(SHOW) as Show[]).map((k) => ({ href: `?show=${k}`, label: SHOW[k], on: k === show }))} />
      </ReportBar>
      <ReportTable
        head={["Name", "", "Family", "Den", "Role and positions", "Email", "Phone", "Member ID", "Registration", show === "active" ? "Since" : "Status"]}
        rows={rows.map((r) => [
          `${r.goes_by || r.first_name} ${r.last_name}`,
          r.person,
          r.family ?? "",
          r.den ?? "",
          [r.role ? ROLE_LABEL[r.role as AppRole] : null, r.positions].filter(Boolean).join(" · "),
          r.email ?? "",
          r.phone ?? "",
          r.member_id ?? "",
          r.registration_expires_on ? `${regStatus(r.registration_expires_on).label} (${fmtShortDate(r.registration_expires_on)})` : "Unknown",
          r.active ? (r.added_on ? fmtShortDate(r.added_on) : "") : r.left_on ? `Left ${fmtShortDate(r.left_on)}` : "Left (date unknown)",
        ])}
      />
    </>
  );
}
