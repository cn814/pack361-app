import { Check, ExternalLink, Stamp } from "lucide-react";
import SubmitButton from "@/components/SubmitButton";
import { reviewSubmissions } from "@/app/(app)/scouts/actions";
import { RANK_LABEL, fmtShortDate } from "@/lib/advancement";
import type { Submission } from "@/lib/advancement-data";

const RANK_ORDER = ["lion", "tiger", "wolf", "bear", "webelos", "aol"];
const reqSort = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const shortDay = (d: string | null) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }) : "";

/**
 * Computers: what to enter in Scoutbook Plus, laid out like its screens. One block per rank and
 * adventure; scouts down the side, requirements across the top, the date each was done in the
 * cell. Mark a row (or the whole adventure) entered when it's in Scoutbook.
 */
export default function ScoutbookGrid({ list }: { list: Submission[] }) {
  const blocks = new Map<string, Submission[]>();
  for (const s of list) {
    const k = `${s.rank ?? ""}|${s.adventure}`;
    blocks.set(k, [...(blocks.get(k) ?? []), s]);
  }
  const ordered = [...blocks.values()].sort(
    (a, b) =>
      RANK_ORDER.indexOf(a[0].rank ?? "") - RANK_ORDER.indexOf(b[0].rank ?? "") || a[0].adventure.localeCompare(b[0].adventure),
  );
  const scouts = new Set(list.map((s) => s.scout_id)).size;
  return (
    <div className="hidden space-y-4 lg:block">
      <div className="card flex items-center justify-between gap-4 py-3">
        <p className="text-sm text-ink">
          <b>{list.length}</b> requirement{list.length === 1 ? "" : "s"} for <b>{scouts}</b> scout{scouts === 1 ? "" : "s"} in{" "}
          <b>{ordered.length}</b> adventure{ordered.length === 1 ? "" : "s"}. Work down the list: each block is one adventure in
          Scoutbook Plus.
        </p>
        <a href="https://advancements.scouting.org/" target="_blank" rel="noopener noreferrer" className="btn-primary shrink-0 py-2">
          Open Scoutbook Plus <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      </div>
      <div className="grid grid-cols-[16rem_minmax(0,1fr)] items-start gap-4">
        <aside className="card sticky top-6 space-y-2 text-sm">
          <h3 className="font-extrabold text-pine-950">In Scoutbook Plus</h3>
          <ol className="list-decimal space-y-1.5 pl-4 text-ink">
            <li>Open your den&apos;s roster and select the scouts in a block.</li>
            <li>Open their rank, then the adventure.</li>
            <li>Mark the requirements that have a ✓ here, with the date shown.</li>
            <li>Save, then click <b>Entered</b> here.</li>
          </ol>
          <p className="text-[11px] text-muted">Scouts with different dates for the same requirement are easiest one row at a time.</p>
          <h3 className="pt-2 font-extrabold text-pine-950">Adventures</h3>
          <ul className="space-y-1">
            {ordered.map((b) => (
              <li key={`${b[0].rank}|${b[0].adventure}`}>
                <a href={`#sb-${encodeURIComponent(`${b[0].rank ?? ""}-${b[0].adventure}`)}`} className="flex justify-between gap-2 text-pine hover:underline">
                  <span className="truncate">{b[0].adventure}</span>
                  <span className="shrink-0 text-muted">{b.length}</span>
                </a>
              </li>
            ))}
          </ul>
        </aside>
        <div className="space-y-4">
          {ordered.map((b) => {
            const reqs = [...new Set(b.map((s) => s.requirement))].sort(reqSort);
            const rows = new Map<string, Submission[]>();
            for (const s of b) rows.set(s.scout_id, [...(rows.get(s.scout_id) ?? []), s]);
            const people = [...rows.values()].sort(
              (x, y) => (x[0].scout?.last_name ?? "").localeCompare(y[0].scout?.last_name ?? "") || (x[0].scout?.first_name ?? "").localeCompare(y[0].scout?.first_name ?? ""),
            );
            return (
              <section key={`${b[0].rank}|${b[0].adventure}`} id={`sb-${encodeURIComponent(`${b[0].rank ?? ""}-${b[0].adventure}`)}`} className="card scroll-mt-6 space-y-3 p-0">
                <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-sage">{b[0].rank ? RANK_LABEL[b[0].rank] : "Adventure"}</p>
                    <h3 className="text-lg font-extrabold text-pine-950">{b[0].adventure}</h3>
                  </div>
                  <form action={reviewSubmissions}>
                    {b.map((s) => (
                      <input key={s.id} type="hidden" name="id" value={s.id} />
                    ))}
                    <SubmitButton name="decision" value="record" className="btn-ghost py-2">
                      <Stamp className="h-4 w-4" aria-hidden /> All {b.length} entered
                    </SubmitButton>
                  </form>
                </header>
                <div className="overflow-x-auto px-4 pb-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                        <th className="w-56 py-1.5 pr-3 font-bold">Scout</th>
                        {reqs.map((r) => (
                          <th key={r} className="w-16 px-2 py-1.5 text-center font-bold">
                            Req {r}
                          </th>
                        ))}
                        <th className="py-1.5 pl-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {people.map((row) => {
                        const by = new Map(row.map((s) => [s.requirement, s]));
                        return (
                          <tr key={row[0].scout_id} className="hover:bg-surface-low">
                            <td className="py-2 pr-3">
                              <span className="font-semibold text-ink">
                                {row[0].scout?.first_name} {row[0].scout?.last_name}
                              </span>
                              {row[0].scout?.den?.name && <span className="block text-[11px] text-muted">{row[0].scout.den.name}</span>}
                            </td>
                            {reqs.map((r) => {
                              const s = by.get(r);
                              return (
                                <td key={r} className="px-2 py-2 text-center">
                                  {s ? (
                                    <span className="inline-flex flex-col items-center rounded-lg bg-mint px-2 py-0.5 text-pine" title={`Done ${fmtShortDate(s.completed_on)}`}>
                                      <Check className="h-4 w-4" aria-label="To enter" />
                                      <span className="text-[10px] font-semibold">{shortDay(s.completed_on)}</span>
                                    </span>
                                  ) : (
                                    <span className="text-line">·</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="py-2 pl-3 text-right">
                              <form action={reviewSubmissions}>
                                {row.map((s) => (
                                  <input key={s.id} type="hidden" name="id" value={s.id} />
                                ))}
                                <SubmitButton name="decision" value="record" className="rounded-lg px-2 py-1 text-xs font-bold text-pine underline">
                                  Entered
                                </SubmitButton>
                              </form>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

