import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Gift, UserX, Undo2 } from "lucide-react";
import SubmitButton from "@/components/SubmitButton";
import PrintButton from "@/components/PrintButton";
import { isLeader, requireMember } from "@/lib/data";
import { getAwardsToHandOut, getOwedAwards, getReviewableScouts, type OwedAward } from "@/lib/advancement-data";
import { RANKS, awardLabel, fmtShortDate } from "@/lib/advancement";
import { getSettings } from "@/lib/settings";
import type { Scout } from "@/lib/types";
import { hereAfterAll, markNotHere, markOwedGiven } from "../../actions";

export const metadata: Metadata = { title: "Awards night sheet" };

const KIND_ORDER = { rank: 0, adventure: 1, award: 2, requirement: 3 } as const;
/** The pack's calendar date of a moment (an evening awards night is already tomorrow in UTC). */
const etDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
const denOrder = (s: Scout) => (s.den ? RANKS.indexOf(s.den.rank) : 99);

export default async function AwardsSheetPage() {
  const me = await requireMember();
  if (!isLeader(me)) redirect("/scouts");
  const [scouts, settings] = await Promise.all([getReviewableScouts(), getSettings()]);
  const [items, owed] = await Promise.all([
    getAwardsToHandOut(scouts.map((s) => s.id), settings.awards_tracked_from),
    getOwedAwards(scouts.map((s) => s.id)),
  ]);
  // Not here: every award on tonight's list for this scout is on the Still owed list.
  const owedByScout = new Map<string, OwedAward[]>();
  for (const o of owed) owedByScout.set(o.scout_id, [...(owedByScout.get(o.scout_id) ?? []), o]);
  const notHere = (id: string) => {
    const labels = new Set((owedByScout.get(id) ?? []).map((o) => o.label));
    const tonight = items.filter((r) => r.scout_id === id);
    return tonight.length > 0 && tonight.every((r) => labels.has(awardLabel(r)));
  };
  const scoutById = new Map(scouts.map((s) => [s.id, s]));
  const owedScouts = [...owedByScout.keys()]
    .map((id) => scoutById.get(id))
    .filter((s): s is Scout => Boolean(s))
    .sort((a, b) => denOrder(a) - denOrder(b) || a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));

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
          {owedScouts.length > 0 && (
            <>
              {" · "}
              <a href="#owed" className="font-semibold text-gold-800 underline">
                {owedScouts.length} still owed
              </a>
            </>
          )}
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

      {owedScouts.length > 0 && (
        <section id="owed" className="card scroll-mt-20 space-y-3 border-l-4 border-l-gold break-inside-avoid print:border-0 print:shadow-none">
          <div>
            <h2 className="section-title">Still owed ({owedScouts.length} scout{owedScouts.length === 1 ? "" : "s"})</h2>
            <p className="text-xs text-muted">
              Scouts who weren&apos;t there when their awards were handed out. They stay here, even after they&apos;re marked awarded in
              Scoutbook, until you tap <b>Given</b>.
            </p>
          </div>
          <ul className="divide-y divide-line">
            {owedScouts.map((s) => {
              const list = owedByScout.get(s.id)!;
              return (
                <li key={s.id} className="break-inside-avoid space-y-1.5 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-bold text-ink">
                      {s.first_name} {s.last_name}
                    </p>
                    <span className="text-xs text-muted">
                      {s.den?.name ?? "No den"} · missed {fmtShortDate(etDate(list[0].noted_at))}
                    </span>
                  </div>
                  <ul className="space-y-1 text-sm">
                    {list.map((o) => (
                      <li key={o.id} className="flex items-start gap-2">
                        <span className="mt-0.5 h-4 w-4 shrink-0 rounded border-2 border-gold" aria-hidden />
                        <span className={o.kind === "rank" ? "font-bold text-pine" : "text-navy"}>{o.label}</span>
                      </li>
                    ))}
                  </ul>
                  <form action={markOwedGiven} className="print:hidden">
                    <input type="hidden" name="scout_id" value={s.id} />
                    <SubmitButton className="btn-ghost w-full py-2">
                      <Gift className="h-4 w-4" aria-hidden /> Given to {s.first_name}
                    </SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-ink">
                      {s.first_name} {s.last_name}
                      {notHere(s.id) && (
                        <span className="ml-2 rounded-full bg-gold-50 px-2 py-0.5 align-middle text-[11px] font-bold text-gold-800">Not here · owed</span>
                      )}
                    </p>
                    <form action={notHere(s.id) ? hereAfterAll : markNotHere} className="shrink-0 print:hidden">
                      <input type="hidden" name="scout_id" value={s.id} />
                      <SubmitButton className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold text-pine ring-1 ring-line">
                        {notHere(s.id) ? (
                          <>
                            <Undo2 className="h-3.5 w-3.5" aria-hidden /> Here after all
                          </>
                        ) : (
                          <>
                            <UserX className="h-3.5 w-3.5" aria-hidden /> Not here
                          </>
                        )}
                      </SubmitButton>
                    </form>
                  </div>
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
        Tap <b>Not here</b> for anyone who missed it: their awards move to <b>Still owed</b> at the top until you tap Given. After the
        ceremony, mark everything awarded in Scoutbook Plus; the next import clears tonight&apos;s list.
      </p>
    </>
  );
}
