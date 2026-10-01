import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Archive, ArchiveRestore, Download, ExternalLink, Trash2 } from "lucide-react";
import BackLink from "@/components/BackLink";
import DocumentForm from "@/components/DocumentForm";
import SubmitButton from "@/components/SubmitButton";
import { isCommittee, requireMember } from "@/lib/data";
import { getMessageableDens } from "@/lib/audience";
import { canEditDocument, getDocument, getDocumentFolders } from "@/lib/documents";
import { fmtDay } from "@/lib/format";
import { deleteDocument, setDocumentArchived } from "../../actions";

export const metadata: Metadata = { title: "Edit document" };

export default async function EditDocumentPage({ params }: PageProps<"/documents/[id]/edit">) {
  const me = await requireMember();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const doc = await getDocument(id);
  if (!doc) notFound();
  if (!canEditDocument(me, doc)) redirect("/documents");
  const [folders, dens] = await Promise.all([getDocumentFolders(), getMessageableDens(me)]);
  // Keep the document's current den in the list even if it isn't one this person leads.
  const denOptions =
    doc.den_id && !dens.some((d) => d.id === doc.den_id) ? [...dens, { id: doc.den_id, name: doc.den?.name ?? "Den" }] : dens;
  const archived = Boolean(doc.archived_at);
  return (
    <>
      <BackLink href={archived ? "/documents?view=archived" : "/documents"} label="Pack documents" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Edit document</h1>
      {archived && (
        <p className="flex items-start gap-1.5 rounded-2xl border border-line bg-surface p-3 text-sm text-muted">
          <Archive className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Archived {fmtDay(doc.archived_at!)}. Families don&apos;t see it; leaders can still open it.
        </p>
      )}
      <div className="flex gap-2">
        <a href={`/documents/${doc.id}`} target="_blank" rel="noopener" className="btn-ghost flex-1 py-2">
          <ExternalLink className="h-4 w-4" aria-hidden /> Open
        </a>
        <a href={`/documents/${doc.id}?download=1`} className="btn-ghost flex-1 py-2">
          <Download className="h-4 w-4" aria-hidden /> Download
        </a>
      </div>
      <section className="card">
        <DocumentForm
          doc={{
            id: doc.id,
            title: doc.title,
            description: doc.description,
            folder: doc.folder,
            audience: doc.audience,
            den_id: doc.den_id,
            pinned: doc.pinned,
            file_name: doc.file_name,
            size_bytes: Number(doc.size_bytes),
          }}
          folders={folders}
          dens={denOptions}
          committee={isCommittee(me)}
        />
      </section>
      <section className="card space-y-2">
        <h2 className="section-title">Link to it</h2>
        <p className="text-sm text-muted">
          To link this document from a Pack guide page, paste{" "}
          <code className="break-all rounded bg-surface-low px-1 text-[13px] text-ink">
            [{doc.title}](/documents/{doc.id})
          </code>
        </p>
      </section>
      <form action={setDocumentArchived}>
        <input type="hidden" name="id" value={doc.id} />
        <input type="hidden" name="archive" value={archived ? "0" : "1"} />
        <SubmitButton className="btn-ghost w-full py-2 text-sm">
          {archived ? <ArchiveRestore className="h-4 w-4" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
          {archived ? "Put back in the documents list" : "Archive (families stop seeing it)"}
        </SubmitButton>
      </form>
      {isCommittee(me) && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-bold text-danger">Delete for good</summary>
          <form action={deleteDocument} className="space-y-2 pt-3">
            <p className="text-xs text-muted">
              This removes the document and its file, and links to it stop working. It can&apos;t be undone; archiving is usually
              enough.
            </p>
            <input type="hidden" name="id" value={doc.id} />
            <SubmitButton className="btn-ghost w-full border-danger py-2 text-danger">
              <Trash2 className="h-4 w-4" aria-hidden /> Delete “{doc.title}”
            </SubmitButton>
          </form>
        </details>
      )}
    </>
  );
}
