import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { isLeader, requireMember } from "@/lib/data";
import { getAwardsToHandOut, getReviewableScouts } from "@/lib/advancement-data";
import { RANK_LABEL, fmtShortDate } from "@/lib/advancement";

export const metadata: Metadata = { title: "Awards to hand out" };

export default async function AwardsPage({ searchParams }: PageProps<"/scouts/awards">) {
  const me = await requireMember();
  if (!isLeader(me)) redirect("/scouts");
  const { view } = await searchParams;
  const byScoutView = view === "scout";
  const scouts = await getReviewableScouts();
  const items = await getAwardsToHandOut(scouts.map((s) => s.id));
  const scoutById = new Map(scouts.map((s) => [s.id, s]));

  const label = (r: (typeof items)[number]) =>
    r.kind === "adventure"
      ? `${r.adventure}${r.rank ? ` (${RANK_LABEL[r.rank]})` : ""}`
      : r.kind === "rank"
        ? `${r.item} patch`
        : r.item;
  const kindLabel = { adventure: "Adventure loops & pins", rank: "Rank patches", award: "Other awards", requirement: "" };

  const groups = new Map<string, { title: string; kind: string; rows: typeof items }>();
  for (const r of items) {
    const s = scoutById.get(r.scout_id);
    const key = byScoutView ? r.scout_id : `${r.kind}|${label(r)}`;
    const title = byScoutView ? `${s?.first_name} ${s?.last_name}` : label(r);
    const g = groups.get(key) ?? { title, kind: r.kind, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }
  const list = [...groups.values()].sort((a, b) =>
    byScoutView ? a.title.localeCompare(b.title) : a.kind.localeCompare(b.kind) || b.rows.length - a.rows.length,
  );
  const oldest = items[0]?.completed_on;

  return (
    <>
      <Link href="/scouts" className="inline-flex items-center gap-1 text-sm font-semibold text-pine">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Scouts
      </Link>
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Awards to hand out</h1>
      <p className="text-sm text-muted">
        Approved in Scoutbook but not marked awarded: {items.length} item{items.length === 1 ? "" : "s"}
        {oldest && `, oldest from ${fmtShortDate(oldest)}`}. Mark them awarded in Scoutbook after the pack meeting and they drop
        off here at the next import.
      </p>
      <div className="flex gap-2 text-sm font-semibold">
        <Link href="/scouts/awards" className={`rounded-full px-3 py-1 ${!byScoutView ? "bg-pine text-white" : "bg-white text-pine ring-1 ring-line"}`}>
          Shopping list
        </Link>
        <Link href="/scouts/awards?view=scout" className={`rounded-full px-3 py-1 ${byScoutView ? "bg-pine text-white" : "bg-white text-pine ring-1 ring-line"}`}>
          By scout
        </Link>
      </div>

      {list.length === 0 && <p className="card text-sm text-muted">Everything approved has been awarded.</p>}
      {list.map((g, i) => (
        <section key={g.title + i} className="card space-y-1">
          {!byScoutView && (i === 0 || list[i - 1].kind !== g.kind) && (
            <p className="section-title">{kindLabel[g.kind as keyof typeof kindLabel]}</p>
          )}
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-extrabold text-pine-950">{g.title}</h2>
            <span className="badge bg-gold text-pine-950">× {g.rows.length}</span>
          </div>
          <ul className="text-sm text-muted">
            {g.rows.map((r) => {
              const s = scoutById.get(r.scout_id);
              return (
                <li key={r.scout_id + label(r)} className="flex justify-between gap-2">
                  <span className="text-ink">{byScoutView ? label(r) : `${s?.first_name} ${s?.last_name}`}</span>
                  <span className="shrink-0 text-xs">
                    {byScoutView ? "" : `${s?.den?.name ?? ""} · `}
                    {fmtShortDate(r.completed_on)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
