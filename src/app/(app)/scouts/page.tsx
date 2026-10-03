import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronRight, ClipboardCheck, FileUp, Grid3x3, Printer, ShoppingBag, Stamp } from "lucide-react";
import { ProgressBar, ProgressSummary } from "@/components/RankProgress";
import { getMyScouts, isLeader, requireMember } from "@/lib/data";
import { getMode } from "@/lib/mode";
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

export default async function ScoutsPage({ searchParams }: PageProps<"/scouts">) {
  const me = await requireMember();
  const { scout: picked } = await searchParams;
  // Leader mode puts dens first; Family mode shows just your own scouts.
  const leader = isLeader(me) && (await getMode(me)) === "leader";
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
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">{leader ? "Dens" : "Scouts"}</h1>

      {!leader && mine.length > 0 && <MyScouts mine={mine} picked={typeof picked === "string" ? picked : undefined} records={records} catalog={catalog} />}

      {leader && (
        <section className="space-y-2">
          <h2 className="section-title">Leader tools</h2>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
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

      <div className="page-wide space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
      {denOrder.map((den) => (
        <section key={den} className="card space-y-1">
          <div className="flex items-center justify-between">
            <h2 className="section-title">{den}</h2>
            {dens.get(den)![0].den && (
              <span className="flex items-center gap-3">
                <Link href={`/scouts/den/${dens.get(den)![0].den!.id}/meetings`} className="inline-flex items-center gap-1 text-xs font-bold text-pine">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Meetings
                </Link>
                <Link href={`/scouts/den/${dens.get(den)![0].den!.id}`} className="inline-flex items-center gap-1 text-xs font-bold text-pine">
                  <Grid3x3 className="h-3.5 w-3.5" aria-hidden /> Den grid
                </Link>
              </span>
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
      </div>

      {leader && mine.length > 0 && (
        <>
          <h2 className="section-title pt-2">My family</h2>
          <MyScouts mine={mine} picked={typeof picked === "string" ? picked : undefined} records={records} catalog={catalog} />
        </>
      )}

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
          <span className={`badge ${count ? "bg-gold text-on-gold" : "bg-surface text-muted"}`}>{count}</span>
        )}
      </span>
      <span className="text-sm font-bold leading-tight text-navy">{label}</span>
      {sub && <span className="text-[11px] text-muted">{sub}</span>}
    </Link>
  );
}

/** One scout at a time: a chip per scout (name and den), then their rank progress and what's left. */
function MyScouts({ mine, picked, records, catalog }: { mine: Scout[]; picked?: string; records: ScoutRecord[]; catalog: CatalogAdventure[] }) {
  const s = mine.find((x) => x.id === picked) ?? mine[0];
  const p = progressFor(s, records, catalog);
  const req = p?.required ?? [];
  const left = req.filter((a) => !a.done);
  const pct = p ? (p.earned ? 100 : Math.round((p.requiredDone / Math.max(1, req.length)) * 100)) : 0;
  return (
    <section className="space-y-3">
      {mine.length > 1 && (
        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0" aria-label="Scouts">
          {mine.map((x) => (
            <Link
              key={x.id}
              href={`/scouts?scout=${x.id}`}
              aria-current={x.id === s.id ? "page" : undefined}
              className={`flex h-10 shrink-0 items-center gap-1 rounded-full px-4 text-sm font-extrabold ${
                x.id === s.id ? "bg-brand text-white" : "border border-line bg-card text-ink"
              }`}
            >
              {x.first_name}
              {x.den && <span className={`text-[10.5px] font-semibold ${x.id === s.id ? "text-mint-200" : "text-muted"}`}>· {x.den.name} den</span>}
            </Link>
          ))}
        </nav>
      )}
      <div className="card space-y-3">
        <div className="flex items-center gap-4">
          <span
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
            style={{ background: `conic-gradient(var(--color-pine) 0 ${pct}%, var(--color-surface) ${pct}% 100%)` }}
            aria-hidden
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-card text-sm font-extrabold text-pine-950">
              {p ? `${p.requiredDone}/${req.length}` : "–"}
            </span>
          </span>
          <span className="min-w-0">
            <span className="block text-xl font-extrabold text-pine-950">
              {s.first_name}
              {mine.length === 1 && s.den ? <span className="text-sm font-semibold text-muted"> · {s.den.name} den</span> : null}
            </span>
            <span className="block text-sm text-muted">
              {!s.den
                ? "Not in a den yet"
                : p?.earned
                  ? `${RANK_LABEL[s.den.rank]} rank earned`
                  : `${RANK_LABEL[s.den.rank]} rank · ${p?.requiredDone ?? 0} of ${req.length} required adventures${p?.electivesDone ? ` · ${p.electivesDone} elective${p.electivesDone === 1 ? "" : "s"}` : ""}`}
            </span>
          </span>
        </div>
        <Link href={`/scouts/${s.id}/report`} className="btn-primary w-full">
          <ClipboardCheck className="h-4 w-4" aria-hidden /> Report finished requirements
        </Link>
      </div>
      {left.length > 0 && !p?.earned && (
        <div className="space-y-2">
          <h2 className="section-title">Still to do</h2>
          <ul className="card divide-y divide-line p-0">
            {left.slice(0, 4).map((a) => (
              <li key={a.name}>
                <Link href={`/scouts/${s.id}`} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-ink">{a.name}</span>
                    <span className="block text-xs text-muted">
                      {a.reqsDone ? `${a.reqsDone} of ${a.reqCount} requirements` : a.home ? "Not started · try at home" : "Not started"}
                    </span>
                  </span>
                  <span className="w-16 shrink-0">
                    <ProgressBar percent={a.reqCount ? Math.round((a.reqsDone / a.reqCount) * 100) : 0} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Link href={`/scouts/${s.id}`} className="block px-1 text-sm font-bold text-pine">
        All of {s.first_name}&apos;s adventures, attendance and ranks →
      </Link>
    </section>
  );
}
