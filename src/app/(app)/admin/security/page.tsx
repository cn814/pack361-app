import type { Metadata } from "next";
import BackLink from "@/components/BackLink";
import { requireAdmin } from "@/lib/roster-data";
import { getSecurityLog, type SecurityLogRow } from "@/lib/security-log";
import { fmtDay, fmtTime } from "@/lib/format";

export const metadata: Metadata = { title: "Security log" };

const ACTION: Record<string, string> = {
  "adult.added": "Adult added",
  "adult.removed": "Adult removed",
  "adult.changed": "Adult changed",
  "scout.added": "Scout added",
  "scout.removed": "Scout removed",
  "scout.changed": "Scout changed",
  "family.on": "Family turned on",
  "family.off": "Family turned off",
  "family.removed": "Family removed",
  "den_leader.added": "Made a den leader",
  "den_leader.removed": "No longer a den leader",
  "report_access.added": "Given a report",
  "report_access.removed": "Report taken away",
  download: "Downloaded a spreadsheet",
};

const DOWNLOAD: Record<string, string> = {
  roster: "Roster",
  membership: "Membership and dues",
  training: "Training",
  medical_forms: "Medical forms",
  attendance: "Attendance",
  money: "Money",
  finance_report: "Finance report",
};

const FIELD: Record<string, string> = {
  role: "App role",
  position: "Position",
  active: "On",
  family_id: "Family",
  email: "Email",
};

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "none" : v === true ? "yes" : v === false ? "no" : String(v));

/** What changed, in a few words ("App role: parent → den_leader"). */
function describe(r: SecurityLogRow): string {
  const d = r.detail ?? {};
  if (r.action === "download") return DOWNLOAD[r.subject ?? ""] ?? r.subject ?? "";
  if (r.action.startsWith("den_leader.")) return d.den ? `Den: ${show(d.den)}` : "";
  if (r.action.startsWith("report_access.")) return d.report ? `Report: ${show(d.report)}` : "";
  if (r.action.endsWith(".changed")) {
    return Object.entries(d)
      .map(([k, v]) => {
        if (k === "sign_in") return "Sign-in reset";
        if (k === "family_id") return "Moved to another family";
        const [from, to] = Array.isArray(v) ? v : [undefined, v];
        return `${FIELD[k] ?? k}: ${show(from)} → ${show(to)}`;
      })
      .join(" · ");
  }
  if (r.action.endsWith(".added") && d.role) return `App role: ${show(d.role)}`;
  return "";
}

/**
 * Pack admin → Security log: who changed anyone's access, and who downloaded pack spreadsheets.
 * Kept two years; nobody can change or delete an entry from the app.
 */
export default async function SecurityLogPage() {
  await requireAdmin();
  const rows = await getSecurityLog();

  return (
    <>
      <BackLink href="/admin" label="Pack admin" />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Security log</h1>
        <p className="text-sm text-muted">
          Who added or removed people, changed a role, position, email or den leader, gave report access, or downloaded a pack spreadsheet.
          Only admins and the Cubmaster see this. Entries can&apos;t be changed or deleted, and are kept two years.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="card text-sm text-muted">Nothing yet.</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="bg-surface-low text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 font-bold">When</th>
                <th className="px-3 py-2 font-bold">Who</th>
                <th className="px-3 py-2 font-bold">What</th>
                <th className="px-3 py-2 font-bold">About</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-3 py-2 align-top text-xs text-muted">
                    {fmtDay(r.at)}
                    <br />
                    {fmtTime(r.at)}
                  </td>
                  <td className="px-3 py-2 align-top text-ink">{r.actor_name ?? <span className="text-muted">The app (import or nightly job)</span>}</td>
                  <td className="px-3 py-2 align-top">
                    <span className="block font-semibold text-ink">{ACTION[r.action] ?? r.action}</span>
                    <span className="block text-xs text-muted">{describe(r)}</span>
                  </td>
                  <td className="px-3 py-2 align-top text-ink">{r.action === "download" ? "" : r.subject}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length >= 300 && <p className="px-1 text-xs text-muted">Showing the latest 300.</p>}
    </>
  );
}
