import ActionForm, { Field } from "@/components/ActionForm";
import { saveGuidePage } from "@/app/(app)/guide/actions";
import { GUIDE_SECTIONS, type GuidePage } from "@/lib/guide";

/** Edit or create a guide page. */
export default function GuideEditor({ page, sections }: { page?: GuidePage; sections: string[] }) {
  const all = [...new Set([...GUIDE_SECTIONS, ...sections])];
  return (
    <ActionForm action={saveGuidePage} submit={page ? "Save page" : "Add page"}>
      {page && <input type="hidden" name="id" value={page.id} />}
      <Field label="Title">
        <input className="input" name="title" required maxLength={120} defaultValue={page?.title} />
      </Field>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <Field label="Section">
          <input className="input" name="section" list="guide-sections" defaultValue={page?.section ?? "Getting started"} />
          <datalist id="guide-sections">
            {all.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Order" hint="Lower first">
          <input className="input" name="sort_order" type="number" defaultValue={page?.sort_order ?? 100} />
        </Field>
      </div>
      <Field label="One-line summary" hint="Shown in the guide's list and search.">
        <input className="input" name="summary" maxLength={300} defaultValue={page?.summary ?? ""} />
      </Field>
      <Field label="Page text">
        <textarea className="input min-h-96 font-mono text-[13px] leading-relaxed" name="body" defaultValue={page?.body ?? ""} />
      </Field>
      <details className="rounded-xl bg-surface-low p-3 text-xs text-muted">
        <summary className="cursor-pointer font-bold text-navy">Formatting help</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Leave a blank line between paragraphs.</li>
          <li><code>## Heading</code> for a heading, <code>### Smaller heading</code> for a smaller one.</li>
          <li><code>- item</code> for bullets, <code>1. step</code> for numbered steps.</li>
          <li><code>**bold**</code> for bold text, <code>&gt; note</code> for a highlighted note.</li>
          <li><code>[link text](https://…)</code> for a link, or <code>[Events](/events)</code> for a page in the app.</li>
          <li>Text in <code>[Leaders: …]</code> is highlighted as something still to fill in.</li>
        </ul>
      </details>
      <label className="flex items-center gap-2 text-sm font-semibold text-navy">
        <input type="checkbox" name="is_published" defaultChecked={page?.is_published ?? false} className="h-4 w-4 accent-pine" />
        Published (families can see it). Leave unchecked to keep it a draft for leaders.
      </label>
      <label className="flex items-start gap-2 text-sm font-semibold text-navy">
        <input type="checkbox" name="is_public" defaultChecked={page?.is_public ?? false} className="mt-0.5 h-4 w-4 accent-pine" />
        <span>
          Public: anyone can read it on pack361.org without signing in (for pages like joining the pack). Never put family
          details on a public page.
        </span>
      </label>
    </ActionForm>
  );
}
