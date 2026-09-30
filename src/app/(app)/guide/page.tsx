import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { isCommittee, isLeader, requireMember } from "@/lib/data";
import { getGuidePages, plainText } from "@/lib/guide";
import GuideSearch from "./GuideSearch";

export const metadata: Metadata = { title: "Pack guide" };

export default async function GuidePage() {
  const me = await requireMember();
  const pages = await getGuidePages();
  const drafts = pages.filter((p) => !p.is_published).length;
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Pack guide</h1>
      <p className="-mt-2 text-sm text-muted">Everything about how Pack 361 works, in one place.</p>
      {isLeader(me) && drafts > 0 && (
        <p className="rounded-2xl border border-gold-100 bg-gold-50 p-3 text-xs text-gold-800">
          {drafts} draft page{drafts === 1 ? "" : "s"} need pack details before families can see them.
          {isCommittee(me) ? " Open one, tap Edit, fill in the highlighted parts and publish." : " A committee member can finish them."}
        </p>
      )}
      {isCommittee(me) && (
        <Link href="/guide/new" className="btn-ghost py-2">
          <Plus className="h-4 w-4" aria-hidden /> Add a page
        </Link>
      )}
      <GuideSearch
        items={pages.map((p) => ({
          slug: p.slug,
          section: p.section,
          title: p.title,
          summary: p.summary,
          text: plainText(p.body),
          draft: !p.is_published,
        }))}
      />
    </>
  );
}
