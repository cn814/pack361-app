import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import BackLink from "@/components/BackLink";
import GuideBody from "@/components/GuideBody";
import { isLeader, requireMember } from "@/lib/data";
import { getGuidePage } from "@/lib/guide";
import { fmtDay } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/guide/[slug]">): Promise<Metadata> {
  const page = await getGuidePage((await params).slug);
  return { title: page?.title ?? "Pack guide" };
}

export default async function GuideArticle({ params }: PageProps<"/guide/[slug]">) {
  const me = await requireMember();
  const { slug } = await params;
  const page = await getGuidePage(slug);
  if (!page) notFound();
  return (
    <>
      <BackLink href="/guide" label="Pack guide" />
      <article className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge bg-mint text-pine">{page.section}</span>
          {!page.is_published && <span className="badge bg-gold-50 text-gold-800">Draft: leaders only</span>}
        </div>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-pine-950">{page.title}</h1>
        <GuideBody body={page.body} />
        <p className="border-t border-line pt-2 text-[11px] text-muted">Updated {fmtDay(page.updated_at)}</p>
      </article>
      {isLeader(me) && (
        <Link href={`/guide/${page.slug}/edit`} className="btn-ghost py-2">
          <Pencil className="h-4 w-4" aria-hidden /> Edit this page
        </Link>
      )}
      <p className="text-center text-xs text-muted">
        Something out of date or missing? Tell us with <Link href="/family/help" className="font-semibold text-pine underline">Report a problem or send a note</Link>.
      </p>
    </>
  );
}
