import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import BackLink from "@/components/BackLink";
import GuideEditor from "@/components/GuideEditor";
import SubmitButton from "@/components/SubmitButton";
import { isCommittee, requireMember } from "@/lib/data";
import { getGuidePage, getGuidePages } from "@/lib/guide";
import { deleteGuidePage } from "../../actions";

export const metadata: Metadata = { title: "Edit guide page" };

export default async function EditGuidePage({ params }: PageProps<"/guide/[slug]/edit">) {
  const me = await requireMember();
  const { slug } = await params;
  if (!isCommittee(me)) redirect(`/guide/${slug}`);
  const [page, pages] = await Promise.all([getGuidePage(slug), getGuidePages()]);
  if (!page) notFound();
  return (
    <>
      <BackLink href={`/guide/${slug}`} label={page.title} />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Edit page</h1>
      <section className="card">
        <GuideEditor page={page} sections={pages.map((p) => p.section)} />
      </section>
      <details className="card">
        <summary className="cursor-pointer text-sm font-bold text-danger">Delete this page</summary>
        <form action={deleteGuidePage} className="pt-3">
          <input type="hidden" name="id" value={page.id} />
          <SubmitButton className="btn-ghost w-full border-danger py-2 text-danger">
            <Trash2 className="h-4 w-4" aria-hidden /> Delete “{page.title}”
          </SubmitButton>
        </form>
      </details>
    </>
  );
}
