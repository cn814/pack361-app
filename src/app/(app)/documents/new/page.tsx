import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import DocumentForm from "@/components/DocumentForm";
import { isCommittee, isLeader, requireMember } from "@/lib/data";
import { getMessageableDens } from "@/lib/audience";
import { getDocumentFolders } from "@/lib/documents";

export const metadata: Metadata = { title: "Add a document" };

export default async function NewDocumentPage() {
  const me = await requireMember();
  if (!isLeader(me)) redirect("/documents");
  const [folders, dens] = await Promise.all([getDocumentFolders(), getMessageableDens(me)]);
  return (
    <>
      <BackLink href="/documents" label="Pack documents" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Add a document</h1>
      <section className="card">
        <DocumentForm folders={folders} dens={dens} committee={isCommittee(me)} />
      </section>
    </>
  );
}
