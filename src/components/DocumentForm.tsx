"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { FileUp, TriangleAlert } from "lucide-react";
import { Field, type ActionResult, guardAction } from "@/components/ActionForm";
import { cancelDocumentUpload, prepareDocumentUpload, saveDocument } from "@/app/(app)/documents/actions";
import { DOC_ACCEPT, DOC_AUDIENCES, DOC_FOLDERS, DOC_TYPES_HELP, checkDocFile, fmtBytes, type DocAudience } from "@/lib/document-files";

export interface DocumentFormValues {
  id: string;
  title: string;
  description: string | null;
  folder: string;
  audience: DocAudience;
  den_id: string | null;
  pinned: boolean;
  file_name: string;
  size_bytes: number;
}

/**
 * Add or edit a pack document. A picked file goes straight from the browser to storage
 * (through a one-time signed address from the server), then the details are saved.
 */
export default function DocumentForm({
  doc,
  folders,
  dens,
  committee,
}: {
  doc?: DocumentFormValues;
  folders: string[];
  dens: { id: string; name: string }[];
  /** Pack leadership can make leadership-only documents. */
  committee: boolean;
}) {
  const [state, formAction, saving] = useActionState<ActionResult, FormData>(guardAction(saveDocument), {});
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(doc?.title ?? "");
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const busy = uploading || saving;
  const allFolders = [...new Set([...DOC_FOLDERS, ...folders])];
  const audiences = (Object.keys(DOC_AUDIENCES) as DocAudience[]).filter(
    (a) => a !== "committee" || committee || doc?.audience === "committee",
  );

  function pick(f: File | null) {
    setProblem(null);
    if (!f) return setFile(null);
    const bad = checkDocFile(f.name, f.size);
    if (bad) {
      setFile(null);
      setProblem(bad);
      return;
    }
    setFile(f);
    // A starting title from the file name, which is easy to tidy up.
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 120));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProblem(null);
    const fd = new FormData(e.currentTarget);
    fd.delete("file"); // the file itself never goes to the app's server
    if (!doc && !file) return setProblem("Choose a file to upload.");
    if (file) {
      const bad = checkDocFile(file.name, file.size);
      if (bad) return setProblem(bad);
      setUploading(true);
      try {
        const prep = await prepareDocumentUpload(file.name, file.size);
        if ("error" in prep) throw new Error(prep.error);
        const res = await fetch(prep.url, {
          method: "PUT",
          headers: { "content-type": prep.mime, "x-upsert": "false", "cache-control": "max-age=3600" },
          body: new Blob([file], { type: prep.mime }),
        });
        if (!res.ok) {
          await cancelDocumentUpload(prep.path).catch(() => {});
          throw new Error(
            res.status === 413 ? "That file is over 10 MB." : "The upload didn't go through. Check your connection and try again.",
          );
        }
        fd.set("storage_path", prep.path);
        fd.set("file_name", file.name);
      } catch (err) {
        setUploading(false);
        return setProblem(err instanceof Error && err.message ? err.message : "The upload didn't go through. Try again.");
      }
      setUploading(false);
    }
    startTransition(() => formAction(fd));
  }

  const error = problem ?? (!busy ? state.error : null);

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {doc && <input type="hidden" name="id" value={doc.id} />}

      <p className="flex items-start gap-2 rounded-xl border border-gold-100 bg-gold-50 p-3 text-sm font-semibold text-gold-800">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          Don&apos;t upload medical forms, insurance cards, or anything with personal details about scouts or families.
          <span className="mt-1 block text-xs font-normal">
            Blank forms are fine. Every family in the pack can open documents shared with all families.
          </span>
        </span>
      </p>

      <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-outline bg-surface-low p-5 text-center">
        <FileUp className="h-7 w-7 text-pine" aria-hidden />
        <span className="font-bold text-pine">
          {file ? file.name : doc ? "Replace the file (optional)" : "Choose a file"}
        </span>
        <span className="text-xs text-muted">
          {file
            ? fmtBytes(file.size)
            : doc
              ? `Now: ${doc.file_name} · ${fmtBytes(doc.size_bytes)}`
              : DOC_TYPES_HELP}
        </span>
        <input
          type="file"
          name="file"
          accept={DOC_ACCEPT}
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            pick(e.target.files?.[0] ?? null);
            e.target.value = ""; // so picking the same file again still counts
          }}
        />
      </label>
      {file && (
        <button type="button" className="text-xs font-semibold text-muted underline" onClick={() => pick(null)} disabled={busy}>
          {doc ? "Keep the current file" : "Choose a different file"}
        </button>
      )}

      <Field label="Title">
        <input
          className="input"
          name="title"
          required
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Fall campout packing list"
        />
      </Field>
      <Field label="Description (optional)" hint="A line or two so families know what it is.">
        <textarea className="input min-h-20" name="description" maxLength={500} defaultValue={doc?.description ?? ""} />
      </Field>
      <Field label="Folder" hint="Pick one or type a new one.">
        <input className="input" name="folder" list="doc-folders" maxLength={60} defaultValue={doc?.folder ?? ""} placeholder="Forms" />
        <datalist id="doc-folders">
          {allFolders.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Who can see it">
          <select className="input" name="audience" defaultValue={doc?.audience ?? "everyone"}>
            {audiences.map((a) => (
              <option key={a} value={a}>
                {DOC_AUDIENCES[a]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Den" hint={dens.length ? "A den document is for that den's families and leaders." : undefined}>
          <select className="input" name="den_id" defaultValue={doc?.den_id ?? ""}>
            <option value="">Whole pack</option>
            {dens.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} only
              </option>
            ))}
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold text-navy">
        <input type="checkbox" name="pinned" defaultChecked={doc?.pinned ?? false} className="h-4 w-4 accent-pine" />
        Pin to the top of the list
      </label>

      <button className={`btn-primary w-full ${busy ? "is-busy" : ""}`} disabled={busy}>
        {uploading ? "Uploading…" : saving ? "Saving…" : doc ? "Save changes" : "Add document"}
      </button>
      {error && <p className="text-sm font-semibold text-danger">{error}</p>}
    </form>
  );
}
