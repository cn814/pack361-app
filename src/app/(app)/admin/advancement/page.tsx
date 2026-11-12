import type { Metadata } from "next";
import { Award, ClipboardCheck, FileUp, Printer } from "lucide-react";
import BackLink from "@/components/BackLink";
import ActionForm, { Field } from "@/components/ActionForm";
import { requireAdmin } from "@/lib/roster-data";
import { getSettings } from "@/lib/settings";
import { getLastImport } from "@/lib/advancement-data";
import { timeAgo } from "@/lib/format";
import { saveSettings } from "../actions";
import Tile from "../Tile";

export const metadata: Metadata = { title: "Advancement" };

export default async function AdminAdvancementPage() {
  await requireAdmin();
  const [settings, lastImport] = await Promise.all([getSettings(), getLastImport()]);
  return (
    <>
      <BackLink href="/admin" label="Pack admin" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Advancement</h1>
      <div className="space-y-2">
        <Tile
          href="/scouts/import"
          icon={FileUp}
          label="Import Scoutbook"
          sub={`Advancement export from Scoutbook Plus · ${lastImport ? `last import ${timeAgo(lastImport.imported_at)}` : "never imported"}`}
        />
        <Tile href="/scouts/review" icon={ClipboardCheck} label="Approvals and Scoutbook" sub="Reports to approve, and approved items to enter in Scoutbook" />
        <Tile href="/scouts/awards" icon={Award} label="Awards to hand out" sub="Scout Shop shopping list and bag labels" />
        <Tile href="/scouts/awards/sheet" icon={Printer} label="Awards night cheat sheet" sub="One printed page for the leaders, by den" />
      </div>
      <section className="card space-y-3">
        <h2 className="section-title">Awards tracking</h2>
        <ActionForm action={saveSettings}>
          <Field label="Track awards earned on or after" hint="Anything earned before this date counts as already handed out.">
            <input className="input" type="date" name="awards_tracked_from" defaultValue={settings.awards_tracked_from} />
          </Field>
        </ActionForm>
      </section>
    </>
  );
}
