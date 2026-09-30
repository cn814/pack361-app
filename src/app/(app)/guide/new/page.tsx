import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import GuideEditor from "@/components/GuideEditor";
import { isCommittee, requireMember } from "@/lib/data";
import { getGuidePages } from "@/lib/guide";

export const metadata: Metadata = { title: "New guide page" };

export default async function NewGuidePage() {
  const me = await requireMember();
  if (!isCommittee(me)) redirect("/guide");
  const pages = await getGuidePages();
  return (
    <>
      <BackLink href="/guide" label="Pack guide" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">New guide page</h1>
      <section className="card">
        <GuideEditor sections={pages.map((p) => p.section)} />
      </section>
    </>
  );
}
