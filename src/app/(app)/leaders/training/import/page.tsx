import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import { MyScoutingLink } from "@/components/TrainingStatus";
import { requireMember } from "@/lib/data";
import { isAdmin } from "@/lib/advancement-data";
import { getImportRoster } from "@/lib/training-data";
import { today } from "@/lib/training";
import ImportTraining from "./ImportTraining";

export const metadata: Metadata = { title: "Import training" };

export default async function ImportTrainingPage() {
  const me = await requireMember();
  // Same people who can edit other leaders' training dates.
  if (!isAdmin(me)) redirect("/leaders/training");
  const roster = await getImportRoster();

  return (
    <>
      <BackLink href="/leaders/training" label="Leader training" />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Import training from my.scouting</h1>
        <p className="text-sm text-muted">
          Scouting America has no way for pack apps to read training records directly, so upload the report instead. Adults are
          matched by BSA member ID, or by first and last name. Only dates newer than what the app has are applied.
        </p>
      </div>

      <section className="card space-y-2 text-sm text-navy">
        <h2 className="section-title">How to get this report</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Sign in at my.scouting.org on a computer. <MyScoutingLink />
          </li>
          <li>
            Open <b>Menu → My Dashboard → Training Manager</b> (or the unit&apos;s training reports), pick Pack 361, and run
            the leader training report. For Safeguarding Youth only, the <b>YPT Aging</b> report works too.
          </li>
          <li>
            <b>Export</b> it as CSV or Excel (.xlsx) and choose the file below.
          </li>
        </ol>
        <p className="text-xs text-muted">
          These reports usually need a Key 3 role (Committee Chair, Chartered Organization Representative or Cubmaster) or
          Training Manager access. The file stays on this device: only member IDs, matched names, courses and dates are used,
          and anything else in it (addresses, emails, birthdates) is ignored.
        </p>
      </section>

      <ImportTraining roster={roster} today={today()} />
    </>
  );
}
