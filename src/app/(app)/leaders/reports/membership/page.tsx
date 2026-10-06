import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import ReportTable, { ReportBar, ReportChips } from "@/components/ReportTable";
import { requireMember } from "@/lib/data";
import { REPORTS, chargeLabel, getMembershipReport, type MembershipRow } from "@/lib/reports";
import { seasonOf } from "@/lib/finance";
import { regStatus } from "@/lib/registration";
import { fmtShortDate } from "@/lib/advancement";
import { ROLE_LABEL } from "@/lib/roster-data";
import { todayEastern } from "@/lib/meetings";
import type { AppRole } from "@/lib/types";

export const metadata: Metadata = { title: "Membership and dues" };

const SHOW = { all: "Everyone", unpaid: "Something unpaid", unregistered: "Registration expired or unknown" } as const;
type Show = keyof typeof SHOW;

const owes = (s: string | null) => s === "open" || s === "reported";

function matches(r: MembershipRow, show: Show): boolean {
  if (show === "unpaid") return owes(r.national_fee) || owes(r.council_fee) || owes(r.pack_dues) || (r.person === "Scout" && !r.pack_dues);
  if (show === "unregistered") return ["expired", "unknown"].includes(regStatus(r.registration_expires_on).state);
  return true;
}

/** Membership: who's registered and who has paid registration fees and pack dues. No contact details. */
export default async function MembershipReportPage({ searchParams }: PageProps<"/leaders/reports/membership">) {
  await requireMember();
  const sp = await searchParams;
  const current = seasonOf(todayEastern());
  const season = typeof sp.season === "string" && /^\d{4}-\d{2}$/.test(sp.season) ? sp.season : current;
  const all = await getMembershipReport(season);
  if (!all) redirect("/lead#reports");
  const show: Show = typeof sp.show === "string" && sp.show in SHOW ? (sp.show as Show) : "all";
  const rows = all.filter((r) => matches(r, show));
  const scouts = all.filter((r) => r.person === "Scout");
  const duesPaid = scouts.filter((r) => r.pack_dues === "paid" || r.pack_dues === "waived").length;

  return (
    <>
      <BackLink href="/lead#reports" label="Reports" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">{REPORTS.membership.title}</h1>
      <p className="-mt-1 text-sm text-muted">
        {season} season: {duesPaid} of {scouts.length} scouts&rsquo; pack dues paid. Registration fees are each person&rsquo;s newest national and
        council charge. A blank means no charge in the app.
      </p>
      <ReportBar csv={`${REPORTS.membership.csv}?season=${season}`}>
        <ReportChips items={(Object.keys(SHOW) as Show[]).map((k) => ({ href: `?season=${season}&show=${k}`, label: SHOW[k], on: k === show }))} />
      </ReportBar>
      <ReportTable
        head={["Name", "", "Den or role", "Family", "Registration", "National fee", "Council fee", `Pack dues ${season}`]}
        rows={rows.map((r) => [
          r.name,
          r.person,
          r.den ?? (r.role ? ROLE_LABEL[r.role as AppRole] : ""),
          r.family ?? "",
          r.registration_expires_on ? `${regStatus(r.registration_expires_on).label} (${fmtShortDate(r.registration_expires_on)})` : "Unknown",
          chargeLabel(r.national_fee),
          chargeLabel(r.council_fee),
          r.person === "Scout" ? chargeLabel(r.pack_dues) || "No dues charge" : "",
        ])}
      />
    </>
  );
}
