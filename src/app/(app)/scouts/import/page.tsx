import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireMember } from "@/lib/data";
import { getLastImport, isAdmin } from "@/lib/advancement-data";
import { fmtDay, fmtTime } from "@/lib/format";
import ImportForm from "./ImportForm";
import ConnectionTest from "./ConnectionTest";
import { myScoutingConfigured } from "@/lib/myscouting";
import { changesText } from "@/lib/import-changes";

export const metadata: Metadata = { title: "Import from Scoutbook" };

export default async function ImportPage() {
  const me = await requireMember();
  if (!isAdmin(me)) redirect("/scouts");
  const last = await getLastImport();

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
        </p>
      )}

      <ImportForm />
      <ConnectionTest configured={myScoutingConfigured()} />
    </>
  );
}
