import type { Metadata } from "next";
import Link from "next/link";
import BackLink from "@/components/BackLink";
import { getDens, getFamilies, requireAdmin } from "@/lib/roster-data";
import type { AppDen, AppFamily, AppScout } from "@/lib/roster-check";
import RosterCheck from "./RosterCheck";

export const metadata: Metadata = { title: "Roster check" };

export default async function RosterCheckPage() {
  await requireAdmin();
  const [families, dens] = await Promise.all([getFamilies(), getDens(true)]);
  const scouts: AppScout[] = families.flatMap((f) =>
    f.scouts.map((s) => ({
      id: s.id,
      family_id: f.id,
      family_name: f.family_name,
      first_name: s.first_name,
      last_name: s.last_name,
      bsa_member_id: s.bsa_member_id,
      den_id: s.den_id,
      is_active: s.is_active && f.is_active,
    })),
  );
  const fams: AppFamily[] = families.map((f) => ({
    id: f.id,
    family_name: f.family_name,
    is_active: f.is_active,
    emails: f.adults.map((a) => a.email.toLowerCase()),
  }));
  const appDens: AppDen[] = dens.map((d) => ({ id: d.id, rank: d.rank, number: d.number, name: d.name, is_active: d.is_active }));

  return (
    <>
      <BackLink href="/admin/roster" label="Families and scouts" />
      <div className="lg:max-w-3xl">
        <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Roster check</h1>
        <p className="text-sm text-muted">
          Compare the app with Scoutbook, which is where registrations live. Best on a computer. Do it after new families
          register, at the start of each school year when scouts move up, and whenever someone leaves.
        </p>
      </div>
      <ol className="card list-decimal space-y-1 pl-8 text-sm text-ink lg:max-w-3xl">
        <li>
          Open{" "}
          <a className="font-semibold text-pine underline" href="https://advancements.scouting.org/" target="_blank" rel="noreferrer">
            Scoutbook Plus
          </a>{" "}
          and go to <b>Roster</b> (or my.scouting.org → Member Manager → Roster).
        </li>
        <li>
          <b>Export</b> the youth roster as CSV or Excel. It needs the scouts&apos; names, member IDs and dens.
        </li>
        <li>Choose the file below. It&apos;s read on this computer; nothing in it is uploaded. Only the changes you click are saved.</li>
      </ol>
      <RosterCheck scouts={scouts} dens={appDens} families={fams} />
      <p className="text-xs text-muted lg:max-w-3xl">
        Added a new family? Send their{" "}
        <Link href="/admin/welcome" className="font-semibold text-pine underline">
          welcome email
        </Link>{" "}
        so they know how to sign in. Families can also ask to join from the app; those requests are under{" "}
        <Link href="/admin/join" className="font-semibold text-pine underline">
          Join requests
        </Link>
        .
      </p>
    </>
  );
}
