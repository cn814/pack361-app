import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import PrintButton from "@/components/PrintButton";
import { isLeader, requireMember } from "@/lib/data";
import { getAwardsToHandOut, getReviewableScouts } from "@/lib/advancement-data";
import { RANKS, awardLabel, fmtShortDate } from "@/lib/advancement";
import { getSettings } from "@/lib/settings";
import type { Scout } from "@/lib/types";

export const metadata: Metadata = { title: "Awards night sheet" };

const KIND_ORDER = { rank: 0, adventure: 1, award: 2, requirement: 3 } as const;

export default async function AwardsSheetPage() {
  const me = await requireMember();
  if (!isLeader(me)) redirect("/scouts");
  const [scouts, settings] = await Promise.all([getReviewableScouts(), getSettings()]);
  const items = await getAwardsToHandOut(scouts.map((s) => s.id), settings.awards_tracked_from);

  // Shopping list: one line per item with a count
  const counts = new Map<string, { label: string; kind: keyof typeof KIND_ORDER; n: number }>();
  for (const r of items) {
    const label = awardLabel(r);
    const c = counts.get(label) ?? { label, kind: r.kind, n: 0 };
    c.n++;
    counts.set(label, c);
  }
  const shopping = [...counts.values()].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.n - a.n || a.label.localeCompare(b.label),
  );

  // Per den, per scout
  const byScout = new Map<string, typeof items>();
  for (const r of items) byScout.set(r.scout_id, [...(byScout.get(r.scout_id) ?? []), r]);
  const dens = new Map<string, Scout[]>();
  for (const s of scouts) {
    if (!byScout.has(s.id)) continue;
    const k = s.den?.name ?? "No den";
    dens.set(k, [...(dens.get(k) ?? []), s]);
  }
  const denRank = (name: string) => {
    const d = scouts.find((s) => (s.den?.name ?? "No den") === name)?.den;
    return d ? RANKS.indexOf(d.rank) : 99;
  };
  const denNames = [...dens.keys()].sort((a, b) => denRank(a) - denRank(b) || a.localeCompare(b));
  const today = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" }).format(new Date());

  return (
    <>
      <Link href="/scouts/awards" className="inline-flex items-center gap-1 text-sm font-semibold text-pine print:hidden">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Awards to hand out
      </Link>
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Pack 361 awards night</h1>
        <p className="text-sm text-muted">
          {today} · {items.length} awards for {byScout.size} scouts · earned since {fmtShortDate(settings.awards_tracked_from)}
        </p>
      </header>
      <PrintButton label="Print sheet" />

      <section className="card space-y-2 break-inside-avoid print:border-0 print:shadow-none">
        <h2 className="section-title">Scout Shop list</h2>
        {shopping.length === 0 && <p className="text-sm text-muted">Nothing to buy.</p>}
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {shopping.map((s) => (
              <tr key={s.label}>
                <td className="py-1.5 pr-2 text-ink">{s.label}</td>
                <td className="w-12 py-1.5 text-right font-extrabold text-pine-950">{s.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {denNames.map((den) => (
        <section key={den} className="card space-y-3 break-before-page print:border-0 print:shadow-none">
          <h2 className="text-lg font-extrabold text-pine-950">{den}</h2>
          <ul className="space-y-3">
            {dens.get(den)!.map((s) => {
              const list = [...byScout.get(s.id)!].sort(
                (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || awardLabel(a).localeCompare(awardLabel(b)),
              );
              return (
                <li key={s.id} className="break-inside-avoid">
                  <p className="font-bold text-ink">
                    {s.first_name} {s.last_name}
                  </p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {list.map((r) => (
                      <li key={awardLabel(r)} className="flex items-start gap-2">
                        <span className="mt-0.5 h-4 w-4 shrink-0 rounded border-2 border-pine" aria-hidden />
                        <span className={r.kind === "rank" ? "font-bold text-pine" : "text-navy"}>{awardLabel(r)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="text-center text-[11px] text-muted print:hidden">
        After the ceremony, mark these awarded in Scoutbook Plus; the next import clears them.
      </p>
    </>
  );
}
