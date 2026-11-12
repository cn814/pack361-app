import type { Metadata } from "next";
import { Files, Images } from "lucide-react";
import BackLink from "@/components/BackLink";
import ActionForm, { Field } from "@/components/ActionForm";
import { requireAdmin } from "@/lib/roster-data";
import { getSettings } from "@/lib/settings";
import { saveSettings } from "../actions";
import { mb, pctOfGb, storageUse } from "../admin-data";
import Tile from "../Tile";

export const metadata: Metadata = { title: "Photos and documents" };

export default async function FilesPage() {
  await requireAdmin();
  const [settings, s] = await Promise.all([getSettings(), storageUse()]);
  return (
    <>
      <BackLink href="/admin" label="Pack admin" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Photos and documents</h1>
      <div className="space-y-2">
        <Tile href="/photos/review" icon={Images} label="Photo review" sub={`Approve uploads, handle removal requests · ${mb(s.photos)} of photos`} />
        <Tile href="/documents" icon={Files} label="Pack documents" sub={`Forms, minutes and pack papers · ${mb(s.docs)} of files`} />
      </div>

      <section className="card space-y-2">
        <h2 className="section-title">File storage</h2>
        <p className="text-sm text-muted">
          {mb(s.total)} of the free 1 GB used ({s.percent}%).
          {s.percent >= 80 && " Getting full: delete old photos or documents, or shorten how long photos are kept."}
        </p>
        <div className="flex h-3 overflow-hidden rounded-full bg-surface" role="img" aria-label={`Photos ${mb(s.photos)}, documents ${mb(s.docs)}, of 1 GB`}>
          <span className="bg-brand" style={{ width: `${pctOfGb(s.photos)}%` }} />
          <span className="bg-gold" style={{ width: `${pctOfGb(s.docs)}%` }} />
          <span className="bg-sage" style={{ width: `${pctOfGb(s.other)}%` }} />
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-brand" aria-hidden /> Photos {mb(s.photos)}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-gold" aria-hidden /> Documents {mb(s.docs)}
          </li>
          {s.other > 0 && (
            <li className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-sage" aria-hidden /> Other files {mb(s.other)}
            </li>
          )}
        </ul>
        <ActionForm action={saveSettings}>
          <Field label="Keep photos for (months)" hint="Photos older than this are deleted automatically.">
            <input className="input" type="number" min={1} max={120} name="photo_keep_months" defaultValue={settings.photo_keep_months} />
          </Field>
        </ActionForm>
      </section>
    </>
  );
}
