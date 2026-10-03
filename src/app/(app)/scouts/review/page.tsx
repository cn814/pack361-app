import type { Metadata } from "next";
import SubmitButton from "@/components/SubmitButton";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, ChevronLeft, Stamp, Undo2 } from "lucide-react";
import ScoutbookGrid from "@/components/ScoutbookGrid";
import { displayName, isLeader, requireMember } from "@/lib/data";
import { getReviewableScouts, getSubmissions, type Submission } from "@/lib/advancement-data";
import { RANK_LABEL, fmtShortDate } from "@/lib/advancement";
import { reviewSubmissions } from "../actions";

export const metadata: Metadata = { title: "Advancement approvals" };

function groupByScout(list: Submission[]) {
  const m = new Map<string, Submission[]>();
  for (const s of list) m.set(s.scout_id, [...(m.get(s.scout_id) ?? []), s]);
  return [...m.values()];
}

/** "Bear Strong: 2, 3 · Fellowship: 1" */
function summarize(list: Submission[]) {
  const m = new Map<string, string[]>();
  for (const s of list) m.set(s.adventure, [...(m.get(s.adventure) ?? []), s.requirement]);
  return [...m.entries()].map(([a, reqs]) => ({
    adventure: a,
    reqs: reqs.sort((x, y) => Number(x) - Number(y)).join(", "),
  }));
}

/**
 * Group approved items the way Scoutbook Plus's multi-scout entry works: one adventure
 * requirement and completion date, then every scout who did it.
 */
function groupByRequirement(list: Submission[]) {
  const m = new Map<string, Submission[]>();
  for (const s of list) {
    const k = [s.rank ?? "", s.adventure, s.requirement, s.completed_on ?? ""].join("|");
    m.set(k, [...(m.get(k) ?? []), s]);
  }
  return [...m.values()].sort(
    (a, b) =>
      (a[0].rank ?? "").localeCompare(b[0].rank ?? "") ||
      a[0].adventure.localeCompare(b[0].adventure) ||
      Number(a[0].requirement) - Number(b[0].requirement) ||
      (a[0].completed_on ?? "").localeCompare(b[0].completed_on ?? ""),
  );
}

export default async function ReviewPage({ searchParams }: PageProps<"/scouts/review">) {
  const byReq = (await searchParams).view === "requirement";
  const me = await requireMember();
  if (!isLeader(me)) redirect("/scouts");
  const [scouts, pending, approved] = await Promise.all([
    getReviewableScouts(),
    getSubmissions({ status: ["submitted"] }),
    getSubmissions({ status: ["approved"] }),
  ]);
  const ids = new Set(scouts.map((s) => s.id));
  const toReview = groupByScout(pending.filter((s) => ids.has(s.scout_id)).reverse());
  const approvedMine = approved.filter((s) => ids.has(s.scout_id)).reverse();
  const toRecord = groupByScout(approvedMine);
  const toRecordByReq = groupByRequirement(approvedMine);

  return (
    <>
      <Link href="/scouts" className="inline-flex items-center gap-1 text-sm font-semibold text-pine">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Scouts
      </Link>
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Approvals and Scoutbook</h1>

      <section className="space-y-3 lg:max-w-3xl">
        <h2 className="section-title">Reported by families ({toReview.reduce((n, g) => n + g.length, 0)})</h2>
        {toReview.length === 0 && <p className="card text-sm text-muted">Nothing waiting. Nice work.</p>}
        {toReview.map((group) => {
          const first = group[0];
          return (
            <article key={first.scout_id} className="card space-y-3">
              <header className="flex items-baseline justify-between gap-2">
                <Link href={`/scouts/${first.scout_id}`} className="font-extrabold text-pine-950 underline-offset-2 hover:underline">
                  {first.scout?.first_name} {first.scout?.last_name}
                </Link>
                <span className="text-xs text-muted">{first.scout?.den?.name}</span>
              </header>
              <ul className="divide-y divide-line">
                {group.map((s) => (
                  <li key={s.id} className="space-y-1.5 py-2">
                    <p className="text-sm">
                      <b className="text-ink">{s.adventure}</b> · requirement {s.requirement}
                      {s.rank && <span className="text-muted"> ({RANK_LABEL[s.rank]})</span>}
                    </p>
                    <p className="text-xs text-muted">
                      Done {fmtShortDate(s.completed_on)}
                      {s.submitter && ` · reported by ${displayName(s.submitter)} ${s.submitter.last_name}`}
                    </p>
                    {s.notes && <p className="rounded-lg bg-surface-low p-2 text-xs text-navy">{s.notes}</p>}
                    <form action={reviewSubmissions} className="flex gap-2">
                      <input type="hidden" name="id" value={s.id} />
                      <input name="review_note" placeholder="Note (optional)" maxLength={500} className="input min-w-0 flex-1 py-2" />
                      <SubmitButton name="decision" value="return" className="btn-ghost px-3 py-2" aria-label="Send back">
                        <Undo2 className="h-4 w-4" aria-hidden />
                      </SubmitButton>
                      <SubmitButton name="decision" value="approve" className="btn-primary px-3 py-2">
                        <Check className="h-4 w-4" aria-hidden /> OK
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
              {group.length > 1 && (
                <form action={reviewSubmissions}>
                  {group.map((s) => (
                    <input key={s.id} type="hidden" name="id" value={s.id} />
                  ))}
                  <SubmitButton name="decision" value="approve" className="btn-primary w-full">
                    <Check className="h-4 w-4" aria-hidden /> Approve all {group.length}
                  </SubmitButton>
                </form>
              )}
            </article>
          );
        })}
      </section>

      <section id="record" className="page-wide scroll-mt-20 space-y-3">
        <h2 className="section-title">Approved — enter in Scoutbook ({toRecord.reduce((n, g) => n + g.length, 0)})</h2>
        <p className="text-xs text-muted">
          After you enter these in Scoutbook Plus, tap “Entered”. The next Scoutbook import also clears them automatically.
        </p>
        {approvedMine.length > 0 && <ScoutbookGrid list={approvedMine} />}
        {toRecord.length > 0 && (
          <div className="flex gap-1 rounded-xl bg-surface-low p-1 text-sm font-semibold lg:hidden" role="tablist" aria-label="Group by">
            <Link
              href="/scouts/review#record"
              role="tab"
              aria-selected={!byReq}
              className={`flex-1 rounded-lg px-3 py-1.5 text-center ${!byReq ? "bg-card text-pine shadow-sm" : "text-muted"}`}
            >
              By scout
            </Link>
            <Link
              href="/scouts/review?view=requirement#record"
              role="tab"
              aria-selected={byReq}
              className={`flex-1 rounded-lg px-3 py-1.5 text-center ${byReq ? "bg-card text-pine shadow-sm" : "text-muted"}`}
            >
              By requirement
            </Link>
          </div>
        )}
        {byReq && toRecord.length > 0 && (
          <p className="text-xs text-muted lg:hidden">
            Matches Scoutbook Plus&apos;s way of marking one requirement for several scouts at once: pick the adventure
            and requirement, check these scouts, use this date.
          </p>
        )}
        {toRecord.length === 0 && <p className="card text-sm text-muted">Nothing to enter.</p>}
        {!byReq && toRecord.map((group) => {
          const first = group[0];
          return (
            <article key={first.scout_id} className="card space-y-2 lg:hidden">
              <header className="flex items-baseline justify-between gap-2">
                <span className="font-extrabold text-pine-950">
                  {first.scout?.first_name} {first.scout?.last_name}
                </span>
                <span className="text-xs text-muted">{first.scout?.den?.name}</span>
              </header>
              <ul className="space-y-0.5 text-sm">
                {summarize(group).map((a) => (
                  <li key={a.adventure}>
                    <b className="text-ink">{a.adventure}</b> <span className="text-muted">req {a.reqs}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted">
                Approved by {group[0].reviewer ? `${displayName(group[0].reviewer)} ${group[0].reviewer.last_name}` : "a leader"}
                {group[0].completed_on && ` · done ${fmtShortDate(group[0].completed_on)}`}
              </p>
              <form action={reviewSubmissions}>
                {group.map((s) => (
                  <input key={s.id} type="hidden" name="id" value={s.id} />
                ))}
                <SubmitButton name="decision" value="record" className="btn-ghost w-full">
                  <Stamp className="h-4 w-4" aria-hidden /> Entered in Scoutbook
                </SubmitButton>
              </form>
            </article>
          );
        })}
        {byReq &&
          toRecordByReq.map((group) => {
            const first = group[0];
            return (
              <article key={first.id} className="card space-y-2 lg:hidden">
                <header className="space-y-0.5">
                  <p className="font-extrabold text-pine-950">
                    {first.adventure} · requirement {first.requirement}
                  </p>
                  <p className="text-xs text-muted">
                    {first.rank ? `${RANK_LABEL[first.rank]} · ` : ""}
                    {first.completed_on ? `done ${fmtShortDate(first.completed_on)}` : "no date"} · {group.length} scout
                    {group.length === 1 ? "" : "s"}
                  </p>
                </header>
                <ul className="flex flex-wrap gap-1.5 text-sm">
                  {group.map((s) => (
                    <li key={s.id} className="rounded-lg bg-surface-low px-2 py-1 text-ink">
                      {s.scout?.first_name} {s.scout?.last_name}
                      {s.scout?.den?.name && <span className="text-[11px] text-muted"> · {s.scout.den.name}</span>}
                    </li>
                  ))}
                </ul>
                <form action={reviewSubmissions}>
                  {group.map((s) => (
                    <input key={s.id} type="hidden" name="id" value={s.id} />
                  ))}
                  <SubmitButton name="decision" value="record" className="btn-ghost w-full">
                    <Stamp className="h-4 w-4" aria-hidden /> Entered in Scoutbook
                  </SubmitButton>
                </form>
              </article>
            );
          })}
      </section>
    </>
  );
}
