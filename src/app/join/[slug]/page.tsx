import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import GuideBody from "@/components/GuideBody";
import { getPublicPage } from "@/lib/guide";
import JoinShell from "../JoinShell";

// Other guide pages a leader has marked public (Pack guide -> Edit -> "Public").
export const revalidate = 300;

export async function generateMetadata({ params }: PageProps<"/join/[slug]">): Promise<Metadata> {
  const page = await getPublicPage((await params).slug);
  return {
    title: { absolute: page ? `${page.title} · Cub Scout Pack 361` : "Cub Scout Pack 361" },
    description: page?.summary ?? undefined,
    robots: { index: true, follow: true },
  manifest: null, // the public site isn't the installable members' app
  appleWebApp: null,
  };
}

export default async function PublicGuidePage({ params }: PageProps<"/join/[slug]">) {
  const { slug } = await params;
  if (slug === "join") return notFound();
  const page = await getPublicPage(slug);
  if (!page) notFound();
  return (
    <JoinShell>
      <Link href="/join" className="inline-flex items-center gap-1 text-sm font-semibold text-pine">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Pack 361
      </Link>
      <article className="card space-y-3 sm:p-8">
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-pine-950">{page.title}</h1>
        <GuideBody body={page.body} />
      </article>
    </JoinShell>
  );
}
