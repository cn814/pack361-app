import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Gift, Undo2, UserX } from "lucide-react";
import SubmitButton from "@/components/SubmitButton";
import PrintButton from "@/components/PrintButton";
import FitOnePage from "@/components/FitOnePage";
import { isLeader, requireMember } from "@/lib/data";
import { getAwardsToHandOut, getCatalog, getOwedAwards, getReviewableScouts, type OwedAward } from "@/lib/advancement-data";
import { ELECTIVES_NEEDED, RANKS, RANK_LABEL, awardLabel, fmtShortDate } from "@/lib/advancement";
import { awardBlurb } from "@/lib/award-blurbs";
import { getSettings } from "@/lib/settings";
import type { DenRank, Scout } from "@/lib/types";
import { hereAfterAll, markNotHere, markOwedGiven } from "../../actions";

export const metadata: Metadata = { title: "Awards night cheat sheet" };

const PRINT_CSS = "@page { size: letter; margin: 0.4in; }";

type Row = Awaited<ReturnType<typeof getAwardsToHandOut>>[number];

interface Line {
  key: string;
  name: string;
  /** Another rank's adventure (a Bear finishing a Wolf elective): shown after the name. */
  otherRank: DenRank | null;
  what: string | null;
  scouts: Set<string>;
  order: number;
}

/**
 * The awards night cheat sheet for the leaders handing out awards: by den, what the den is
 * getting and what they did for it, on one printed page. Below it (on screen only), the scouts
 * expected to get awards, by den, to mark anyone who isn't there.
 */
export default async function AwardsSheetPage() {
  const me = await requireMember();
  if (!isLeader(me)) redirect("/scouts");
  const [scouts, settings, catalog] = await Promise.all([getReviewableScouts(), getSettings(), getCatalog()]);
  const ids = scouts.map((s) => s.id);
  const [items, owed] = await Promise.all([getAwardsToHandOut(ids, settings.awards_tracked_from), getOwedAwards(ids)]);
  const required = (rank: DenRank) => catalog.filter((a) => a.rank === rank && a.required).length;
  const isRequired = new Set(catalog.filter((a) => a.required).map((a) => `${a.rank}|${a.name.toLowerCase()}`));
  const scoutById = new Map(scouts.map((s) => [s.id, s]));

  // Den → lines (one per award, with how many scouts get it).
  const dens = new Map<string, { den: NonNullable<Scout["den"]> | null; scouts: Set<string>; lines: Map<string, Line>; owed: OwedAward[] }>();
  const denOf = (scoutId: string) => {
    const s = scoutById.get(scoutId);
    const k = s?.den?.name ?? "No den";
    if (!dens.has(k)) dens.set(k, { den: s?.den ?? null, scouts: new Set(), lines: new Map(), owed: [] });
    return dens.get(k)!;
  };
  for (const r of items as Row[]) {
    const d = denOf(r.scout_id);
    d.scouts.add(r.scout_id);
    const denRank = d.den?.rank ?? null;
    let line: Omit<Line, "scouts">;
    if (r.kind === "rank") {
      const rank = r.rank ?? denRank;
      line = {
        key: `rank|${rank}`,
        name: rank ? `${RANK_LABEL[rank]} rank` : r.item.replace(/ Rank$/, " rank"),
        otherRank: null,
        what: rank ? `finished the ${required(rank)} required ${RANK_LABEL[rank]} adventures and ${ELECTIVES_NEEDED} electives.` : null,
        order: 0,
      };
    } else if (r.kind === "adventure") {
      const name = r.adventure ?? r.item;
      const req = r.rank ? isRequired.has(`${r.rank}|${name.toLowerCase()}`) : false;
      line = {
        key: `adv|${r.rank}|${name}`,
        name,
        otherRank: r.rank && r.rank !== denRank ? r.rank : null,
        what: awardBlurb(r.rank ?? denRank, name),
        order: req ? 1 : 2,
      };
    } else {
      line = { key: `award|${r.item}`, name: r.item, otherRank: null, what: null, order: 3 };
    }
    const l = d.lines.get(line.key) ?? { ...line, scouts: new Set<string>() };
    l.scouts.add(r.scout_id);
    d.lines.set(line.key, l);
  }
  for (const o of owed) denOf(o.scout_id).owed.push(o);

  const denOrder = (d: { den: Scout["den"] | null }) => (d.den ? RANKS.indexOf(d.den.rank) : 99);
  const denList = [...dens.entries()].sort(([a, x], [b, y]) => denOrder(x) - denOrder(y) || a.localeCompare(b));
  const today = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" }).format(new Date());
  const scoutCount = new Set(items.map((r) => r.scout_id)).size;

  // Who's expected tonight, and who's not here (every award on tonight's list is on Still owed).
  const owedLabels = new Map<string, Set<string>>();
  for (const o of owed) owedLabels.set(o.scout_id, (owedLabels.get(o.scout_id) ?? new Set()).add(o.label));
  const tonightBy = new Map<string, Row[]>();
  for (const r of items as Row[]) tonightBy.set(r.scout_id, [...(tonightBy.get(r.scout_id) ?? []), r]);
  const notHere = (id: string) => (tonightBy.get(id) ?? []).every((r) => owedLabels.get(id)?.has(awardLabel(r)));
  const byLast = (a: string, b: string) => {
    const x = scoutById.get(a), y = scoutById.get(b);
    return (x?.last_name ?? "").localeCompare(y?.last_name ?? "") || (x?.first_name ?? "").localeCompare(y?.first_name ?? "");
  };

  return (
    <>
      <style>{PRINT_CSS}</style>
      <Link href="/scouts/awards" className="inline-flex items-center gap-1 text-sm font-semibold text-pine print:hidden">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Awards to hand out
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-sm text-muted">One page for the leaders handing out awards: what each den is getting and what they did for it.</p>
        <div className="flex flex-wrap gap-2">
          {scoutCount > 0 && (
            <a href="#roster" className="btn-ghost">
              <UserX className="h-4 w-4" aria-hidden /> Mark who&apos;s not here
            </a>
          )}
          <PrintButton label="Print cheat sheet" />
        </div>
      </div>

      <FitOnePage>
        <article className="card space-y-3 print:border-0 print:p-0 print:shadow-none">
          <header className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line pb-2">
            <h1 className="text-xl font-extrabold tracking-tight text-pine-950">Pack 361 awards night</h1>
            <p className="text-xs text-muted">
              {today} · {items.length} award{items.length === 1 ? "" : "s"} for {scoutCount} scout{scoutCount === 1 ? "" : "s"} · earned since{" "}
              {fmtShortDate(settings.awards_tracked_from)}
            </p>
          </header>

          {denList.length === 0 && <p className="text-sm text-muted">Nothing to hand out.</p>}

          <div className="gap-5 sm:columns-2 print:columns-2">
            {denList.map(([name, d]) => {
              const lines = [...d.lines.values()].sort((a, b) => a.order - b.order || b.scouts.size - a.scouts.size || a.name.localeCompare(b.name));
              const owedBy = new Map<string, string[]>();
              for (const o of d.owed) owedBy.set(o.scout_id, [...(owedBy.get(o.scout_id) ?? []), o.label.replace(/ \([^)]*\)$/, "")]);
              return (
                <section key={name} className="mb-4 break-inside-avoid">
                  <h2 className="flex items-baseline justify-between gap-2 border-b-2 border-pine pb-0.5">
                    <span className="text-[15px] font-extrabold text-pine-950">{name}</span>
                    {d.scouts.size > 0 && (
                      <span className="text-[11px] text-muted">
                        {d.scouts.size} scout{d.scouts.size === 1 ? "" : "s"}
                      </span>
                    )}
                  </h2>
                  <ul className="mt-1.5 space-y-1.5">
                    {lines.map((l) => (
                      <li key={l.key} className="text-[12px] leading-snug">
                        <span className={`font-bold ${l.order === 0 ? "text-pine" : "text-ink"}`}>
                          {l.name}
                          {l.otherRank && ` (${RANK_LABEL[l.otherRank]})`}
                        </span>
                        <span className="text-muted"> ×{l.scouts.size}</span>
                        {l.what && <span className="text-navy">: {l.what}</span>}
                      </li>
                    ))}
                  </ul>
                  {owedBy.size > 0 && (
                    <p className="mt-1.5 rounded-md bg-gold-50 px-2 py-1 text-[11px] leading-snug text-gold-800">
                      <b>Still owed from before:</b>{" "}
                      {[...owedBy.entries()]
                        .map(([id, labels]) => `${scoutById.get(id)?.first_name ?? ""} (${labels.join(", ")})`)
                        .join("; ")}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        </article>
      </FitOnePage>

      {denList.length > 0 && (
        <section id="roster" className="card scroll-mt-20 space-y-3 print:hidden">
          <div>
            <h2 className="section-title">Who&apos;s getting awards</h2>
            <p className="text-xs text-muted">
              Tap <b>Not here</b> for anyone who missed it: their awards stay on the <b>Still owed</b> list, even after Scoutbook
              marks them awarded, until you tap <b>Given</b>.
            </p>
          </div>
          <div className="grid gap-x-6 gap-y-4 lg:grid-cols-2">
            {denList.map(([name, d]) => {
              const tonight = [...d.scouts].sort(byLast);
              const owedOnly = [...new Set(d.owed.map((o) => o.scout_id))].filter((id) => !d.scouts.has(id)).sort(byLast);
              return (
                <div key={name} className="space-y-1">
                  <h3 className="border-b border-line pb-0.5 text-sm font-extrabold text-pine-950">{name}</h3>
                  <ul className="divide-y divide-line">
                    {tonight.map((id) => {
                      const s = scoutById.get(id);
                      const away = notHere(id);
                      const n = tonightBy.get(id)?.length ?? 0;
                      const tonightLabels = new Set((tonightBy.get(id) ?? []).map(awardLabel));
                      const before = d.owed.filter((o) => o.scout_id === id && !tonightLabels.has(o.label));
                      return (
                        <li key={id} className="flex items-center justify-between gap-2 py-1.5">
                          <span className="min-w-0 text-sm">
                            <span className={`font-semibold ${away ? "text-muted line-through" : "text-ink"}`}>
                              {s?.first_name} {s?.last_name}
                            </span>
                            <span className="text-xs text-muted">
                              {" "}
                              · {n} award{n === 1 ? "" : "s"}
                            </span>
                            {away && <span className="ml-1.5 rounded-full bg-gold-50 px-2 py-0.5 text-[11px] font-bold text-gold-800">Not here · owed</span>}
                            {before.length > 0 && !away && (
                              <span className="block text-xs text-gold-800">
                                Also owed: {before.map((o) => o.label.replace(/ \([^)]*\)$/, "")).join(", ")}
                              </span>
                            )}
                          </span>
                          {before.length > 0 && !away && (
                            <form action={markOwedGiven} className="shrink-0">
                              <input type="hidden" name="scout_id" value={id} />
                              <SubmitButton className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold text-pine ring-1 ring-line">
                                <Gift className="h-3.5 w-3.5" aria-hidden /> Given
                              </SubmitButton>
                            </form>
                          )}
                          <form action={away ? hereAfterAll : markNotHere} className="shrink-0">
                            <input type="hidden" name="scout_id" value={id} />
                            <SubmitButton className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold text-pine ring-1 ring-line">
                              {away ? (
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
                        </li>
                      );
                    })}
                    {owedOnly.map((id) => {
                      const s = scoutById.get(id);
                      const list = d.owed.filter((o) => o.scout_id === id);
                      return (
                        <li key={id} className="flex items-center justify-between gap-2 py-1.5">
                          <span className="min-w-0 text-sm">
                            <span className="font-semibold text-ink">
                              {s?.first_name} {s?.last_name}
                            </span>
                            <span className="block text-xs text-gold-800">Owed: {list.map((o) => o.label.replace(/ \([^)]*\)$/, "")).join(", ")}</span>
                          </span>
                          <form action={markOwedGiven} className="shrink-0">
                            <input type="hidden" name="scout_id" value={id} />
                            <SubmitButton className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold text-pine ring-1 ring-line">
                              <Gift className="h-3.5 w-3.5" aria-hidden /> Given
                            </SubmitButton>
                          </form>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted">
            The same list, with each scout&apos;s awards, is on{" "}
            <Link href="/scouts/awards?view=scout" className="font-semibold text-pine underline">
              Awards to hand out → By scout
            </Link>
            .
          </p>
        </section>
      )}
    </>
  );
}
