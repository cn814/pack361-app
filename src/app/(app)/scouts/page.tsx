import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ClipboardCheck, UsersRound } from "lucide-react";
import { ProgressBar } from "@/components/RankProgress";
import { getMyScouts, isLeader, requireMember } from "@/lib/data";
import { getCatalog, getRecords, recordsByScout, type ScoutRecord } from "@/lib/advancement-data";
import { RANK_LABEL, rankProgress, type CatalogAdventure } from "@/lib/advancement";
import type { Scout } from "@/lib/types";

export const metadata: Metadata = { title: "Scouts" };

function progressFor(s: Scout, records: Map<string, ScoutRecord[]>, catalog: CatalogAdventure[]) {
  if (!s.den) return null;
  return rankProgress(s.den.rank, records.get(s.id) ?? [], catalog);
}

export default async function ScoutsPage({ searchParams }: PageProps<"/scouts">) {
  const me = await requireMember();
  const { scout: picked } = await searchParams;
  const [mine, catalog] = await Promise.all([getMyScouts(), getCatalog()]);
  const records = recordsByScout(await getRecords(mine.map((s) => s.id)));

  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Scouts</h1>
      {mine.length > 0 && <MyScouts mine={mine} picked={typeof picked === "string" ? picked : undefined} records={records} catalog={catalog} />}
      {!mine.length && <p className="card text-sm text-muted">No scouts are linked to your account.</p>}
      {isLeader(me) && (
        <Link href="/lead#dens" className="card flex items-center gap-3 py-3">
          <UsersRound className="h-5 w-5 shrink-0 text-pine" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-pine-950">Your dens</span>
            <span className="block text-xs text-muted">Rosters, approvals and awards are on the Leaders tab</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        </Link>
      )}
    </>
  );
}

/** One scout at a time: a chip per scout (name and den), then their rank progress and what's left. */
function MyScouts({ mine, picked, records, catalog }: { mine: Scout[]; picked?: string; records: Map<string, ScoutRecord[]>; catalog: CatalogAdventure[] }) {
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
                      {a.reqsDone ? `${a.reqsDone} of ${a.reqCount} requirements` : !a.required && a.home && a.home !== "den" ? "Not started · try at home" : "Not started"}
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
