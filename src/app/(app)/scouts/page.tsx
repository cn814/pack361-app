import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ClipboardCheck, FileUp, Grid3x3, Printer, ShoppingBag, Stamp } from "lucide-react";
import { ProgressBar, ProgressSummary } from "@/components/RankProgress";
import { getMyScouts, isLeader, requireMember } from "@/lib/data";
import {
  getAwardsToHandOut,
  getCatalog,
  getLastImport,
  getRecords,
  getReviewableScouts,
  getSubmissions,
  isAdmin,
  type ScoutRecord,
} from "@/lib/advancement-data";
import { RANK_LABEL, rankProgress, type CatalogAdventure } from "@/lib/advancement";
import { timeAgo } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import type { Scout } from "@/lib/types";

export const metadata: Metadata = { title: "Scouts" };

function progressFor(s: Scout, records: ScoutRecord[], catalog: CatalogAdventure[]) {
  if (!s.den) return null;
  return rankProgress(s.den.rank, records.filter((r) => r.scout_id === s.id), catalog);
}

export default async function ScoutsPage() {
  const me = await requireMember();
  const leader = isLeader(me);
  const [mine, catalog, reviewable, settings] = await Promise.all([
    getMyScouts(),
    getCatalog(),
    leader ? getReviewableScouts() : Promise.resolve([] as Scout[]),
    getSettings(),
  ]);
  const reviewIds = reviewable.map((s) => s.id);
  const [records, pending, approved, awards, lastImport] = await Promise.all([
    getRecords([...new Set([...mine, ...reviewable].map((s) => s.id))]),
    leader ? getSubmissions({ status: ["submitted"] }) : Promise.resolve([]),
    leader ? getSubmissions({ status: ["approved"] }) : Promise.resolve([]),
    getAwardsToHandOut(reviewIds, settings.awards_tracked_from),
    leader ? getLastImport() : Promise.resolve(null),
  ]);
  const inScope = (id: string) => reviewIds.includes(id);
  const pendingCount = pending.filter((s) => inScope(s.scout_id)).length;
  const approvedCount = approved.filter((s) => inScope(s.scout_id)).length;

  // Den roster, grouped by den
  const dens = new Map<string, Scout[]>();
  for (const s of reviewable) {
    const k = s.den?.name ?? "No den";
    dens.set(k, [...(dens.get(k) ?? []), s]);
  }
  const denOrder = [...dens.keys()].sort((a, b) => {
    const ra = reviewable.find((s) => (s.den?.name ?? "No den") === a)?.den;
    const rb = reviewable.find((s) => (s.den?.name ?? "No den") === b)?.den;
    const order = ["lion", "tiger", "wolf", "bear", "webelos", "aol"];
    return (ra ? order.indexOf(ra.rank) : 9) - (rb ? order.indexOf(rb.rank) : 9) || a.localeCompare(b);
  });

  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Scouts</h1>

      {mine.length > 0 && (
        <section className="space-y-3">
          <h2 className="section-title">{mine.length > 1 ? "My scouts" : "My scout"}</h2>
          {mine.map((s) => {
            const p = progressFor(s, records, catalog);
            return (
              <Link key={s.id} href={`/scouts/${s.id}`} className="card block space-y-2 active:bg-surface-low">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    <span className="block text-lg font-extrabold leading-tight text-pine-950">{s.first_name}</span>
                    <span className="block text-xs text-muted">
                      {s.den ? `${s.den.name} · working on ${RANK_LABEL[s.den.rank]}` : "Not in a den yet"}
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 text-muted" aria-hidden />
                </div>
                {p && (
                  <>
                    <ProgressBar percent={p.percent} />
                    <ProgressSummary p={p} />
                  </>
                )}
              </Link>
            );
          })}
        </section>
      )}

      {leader && (
        <section className="space-y-2">
          <h2 className="section-title">Leader tools</h2>
          <div className="grid grid-cols-2 gap-2">
            <Tool href="/scouts/review" icon={ClipboardCheck} label="Approve reports" count={pendingCount} />
            <Tool href="/scouts/review#record" icon={Stamp} label="Enter in Scoutbook" count={approvedCount} />
            <Tool href="/scouts/awards" icon={ShoppingBag} label="Awards to hand out" count={awards.length} />
            <Tool href="/scouts/awards/sheet" icon={Printer} label="Awards night sheet" sub="Printable, by den" />
            {isAdmin(me) && (
              <Tool
                href="/scouts/import"
                icon={FileUp}
                label="Import Scoutbook"
                sub={lastImport ? `Updated ${timeAgo(lastImport.imported_at)}` : "Never imported"}
              />
            )}
          </div>
        </section>
      )}

      {denOrder.map((den) => (
        <section key={den} className="card space-y-1">
          <div className="flex items-center justify-between">
            <h2 className="section-title">{den}</h2>
            {dens.get(den)![0].den && (
              <Link href={`/scouts/den/${dens.get(den)![0].den!.id}`} className="inline-flex items-center gap-1 text-xs font-bold text-pine">
                <Grid3x3 className="h-3.5 w-3.5" aria-hidden /> Den grid
              </Link>
            )}
          </div>
          <ul className="divide-y divide-line">
            {dens.get(den)!.map((s) => {
              const p = progressFor(s, records, catalog);
              return (
                <li key={s.id}>
                  <Link href={`/scouts/${s.id}`} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">
                        {s.first_name} {s.last_name}
                      </span>
                      {p && <ProgressSummary p={p} />}
                    </span>
                    {p && (
                      <span className="w-16 shrink-0">
                        <ProgressBar percent={p.percent} />
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {!mine.length && !reviewable.length && (
        <p className="card text-sm text-muted">No scouts are linked to your account.</p>
      )}
    </>
  );
}

function Tool({
  href,
  icon: Icon,
  label,
  count,
  sub,
}: {
  href: string;
  icon: typeof ClipboardCheck;
  label: string;
  count?: number;
  sub?: string;
}) {
  return (
    <Link href={href} className="card flex flex-col gap-1 p-3 active:bg-surface-low">
      <span className="flex items-center justify-between">
        <Icon className="h-5 w-5 text-pine" aria-hidden />
        {count !== undefined && (
          <span className={`badge ${count ? "bg-gold text-pine-950" : "bg-surface text-muted"}`}>{count}</span>
        )}
      </span>
      <span className="text-sm font-bold leading-tight text-navy">{label}</span>
      {sub && <span className="text-[11px] text-muted">{sub}</span>}
    </Link>
  );
}
