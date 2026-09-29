import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireMember } from "@/lib/data";
import { getCatalog, getRecords, getScout, getSubmissions } from "@/lib/advancement-data";
import { CURRENT_VERSION, RANK_LABEL } from "@/lib/advancement";
import ReportForm, { type ReportAdventure } from "./ReportForm";

export const metadata: Metadata = { title: "Report requirements" };

export default async function ReportPage({ params }: PageProps<"/scouts/[id]/report">) {
  const me = await requireMember();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const scout = await getScout(id);
  if (!scout) notFound();
  if (scout.family_id !== me.family_id || !scout.den) redirect(`/scouts/${id}`);
  const rank = scout.den.rank;
  const [catalog, records, subs] = await Promise.all([
    getCatalog(),
    getRecords([id]),
    getSubmissions({ scoutId: id, status: ["submitted", "approved", "recorded"] }),
  ]);

  const adventures: ReportAdventure[] = catalog
    .filter((a) => a.rank === rank)
    .map((a) => {
      const current = records.filter(
        (r) => r.version === CURRENT_VERSION && r.adventure === a.name && (r.rank === rank || r.rank === null),
      );
      const finished = current.some((r) => r.kind === "adventure");
      const inScoutbook = new Set(
        current.filter((r) => r.kind === "requirement").map((r) => r.item.match(/^\d+/)?.[0] ?? r.item),
      );
      const reported = new Set(subs.filter((s) => s.adventure === a.name && s.rank === rank).map((s) => s.requirement));
      return {
        name: a.name,
        required: a.required,
        special: a.special,
        reqCount: a.req_count,
        finished,
        done: Array.from({ length: a.req_count }, (_, i) => String(i + 1)).filter(
          (n) => finished || inScoutbook.has(n) || reported.has(n),
        ),
      };
    });

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

  return (
    <>
      <Link href={`/scouts/${id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-pine">
        <ChevronLeft className="h-4 w-4" aria-hidden /> {scout.first_name}
      </Link>
      <section className="card space-y-1">
        <h1 className="text-xl font-extrabold tracking-tight text-pine-950">Report finished requirements</h1>
        <p className="text-sm text-muted">
          For {scout.first_name}&apos;s {RANK_LABEL[rank]} handbook. Your den leader approves it, then it&apos;s entered in
          Scoutbook.
        </p>
      </section>
      <ReportForm scoutId={id} rank={rank} adventures={adventures} today={today} />
    </>
  );
}
