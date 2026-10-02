import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Smartphone } from "lucide-react";
import BackLink from "@/components/BackLink";
import PaperworkCard from "@/components/PaperworkCard";
import { requireMember } from "@/lib/data";
import { getMyPaperwork } from "@/lib/paperwork";

export const metadata: Metadata = { title: "Medical forms" };

export default async function FormsPage() {
  const me = await requireMember();
  const paperwork = await getMyPaperwork(me);
  return (
    <>
      <BackLink href="/family" label="Me" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Medical forms</h1>
      <PaperworkCard people={paperwork.people} ownerUserKey={me.id} />
      <Link href="/family/files" className="card flex items-center gap-3">
        <Smartphone className="h-5 w-5 shrink-0 text-pine" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-ink">Saved on this phone</span>
          <span className="block text-xs text-muted">Your own copies of medical forms and insurance cards, kept only on this device.</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </Link>
    </>
  );
}
