import type { Metadata } from "next";
import Link from "next/link";
import { Archive, CircleCheck, FolderOpen, Lock, Plus, TriangleAlert } from "lucide-react";
import { isLeader, requireMember } from "@/lib/data";
import { canEditDocument, countArchivedDocuments, getDocuments, getUploaderNames } from "@/lib/documents";
import { DOC_AUDIENCES, docTypeLabel, fmtBytes } from "@/lib/document-files";
import { fmtDay } from "@/lib/format";
import DocumentList from "./DocumentList";

export const metadata: Metadata = { title: "Pack documents" };

const DONE: Record<string, string> = {
  added: "Document added.",
  saved: "Changes saved.",
  archived: "Moved to the archive. Families no longer see it.",
  restored: "Back in the documents list.",
  deleted: "Document deleted.",
};

export default async function DocumentsPage({ searchParams }: PageProps<"/documents">) {
  const me = await requireMember();
  const leader = isLeader(me);
  const { view, done, missing } = await searchParams;
  const archived = leader && view === "archived";
  const [docs, names, archivedCount] = await Promise.all([
    getDocuments(archived),
    getUploaderNames(),
    leader && !archived ? countArchivedDocuments() : Promise.resolve(0),
  ]);
  const doneMsg = typeof done === "string" ? DONE[done] : undefined;

  return (
    <>
      <div className="flex items-end justify-between gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">{archived ? "Archived documents" : "Pack documents"}</h1>
        {leader && !archived && (
          <Link href="/documents/new" className="btn-primary shrink-0 px-3 py-2">
            <Plus className="h-4 w-4" aria-hidden /> Add a document
          </Link>
        )}
      </div>
      <p className="-mt-2 flex items-center gap-1.5 text-xs text-muted">
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {archived
          ? "Only leaders see archived documents. Open one and tap Edit to put it back."
          : "Forms, minutes, packing lists and more. Only signed-in Pack 361 families see these."}
      </p>

      {doneMsg && (
        <p className="flex items-center gap-2 rounded-2xl border border-mint-200 bg-mint p-3 text-sm font-semibold text-pine">
          <CircleCheck className="h-4 w-4 shrink-0" aria-hidden /> {doneMsg}
        </p>
      )}
      {missing && (
        <p className="flex items-start gap-2 rounded-2xl border border-gold-100 bg-gold-50 p-3 text-sm font-semibold text-gold-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          That document isn&apos;t available. It may have been removed or archived, or it may be just for leaders.
        </p>
      )}

      {leader && (
        <nav className="flex gap-2 text-sm">
          <Link
            href="/documents"
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-bold ${archived ? "text-pine" : "bg-pine text-white"}`}
          >
            <FolderOpen className="h-4 w-4" aria-hidden /> Current
          </Link>
          <Link
            href="/documents?view=archived"
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-bold ${archived ? "bg-pine text-white" : "text-pine"}`}
          >
            <Archive className="h-4 w-4" aria-hidden /> Archived{archivedCount ? ` (${archivedCount})` : ""}
          </Link>
        </nav>
      )}

      <DocumentList
        empty={
          archived
            ? "Nothing in the archive."
            : leader
              ? "No documents yet. Tap “Add a document” to share the first one."
              : "No documents yet. Leaders will add forms and pack papers here."
        }
        items={docs.map((d) => ({
          id: d.id,
          title: d.title,
          description: d.description,
          folder: d.folder,
          mime: d.mime_type,
          typeLabel: docTypeLabel(d.mime_type),
          size: fmtBytes(Number(d.size_bytes)),
          added: fmtDay(d.created_at),
          addedBy: (d.uploaded_by && names.get(d.uploaded_by)) || "a leader",
          tags: [
            ...(d.audience !== "everyone" ? [DOC_AUDIENCES[d.audience]] : []),
            ...(d.den ? [`${d.den.name} only`] : []),
          ],
          pinned: d.pinned,
          canEdit: canEditDocument(me, d),
        }))}
      />
    </>
  );
}
