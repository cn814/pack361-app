import type { Metadata } from "next";
import { scoutFirstName } from "@/lib/page-titles";
import SubmitButton from "@/components/SubmitButton";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, CalendarDays, CircleCheck, ClipboardCheck, House, Medal, Plus, Printer, Tent } from "lucide-react";
import { fmtMeetingDate, fmtMeetingTime, getUpcomingMeetings, meetingAdventures, myMeetingRsvps, todayEastern } from "@/lib/meetings";
import { getAttendanceTotals } from "@/lib/attendance-data";
import { nightsLabel } from "@/lib/attendance";
import { seasonOf, seasonRange } from "@/lib/finance";
import DenMeetingRsvp from "@/components/DenMeetingRsvp";
import { AdventureList, ProgressBar, ProgressSummary } from "@/components/RankProgress";
import { isLeader, requireMember } from "@/lib/data";
import { getCatalog, getDataAsOf, getRecords, getScout, getSubmissions } from "@/lib/advancement-data";
import { ELECTIVES_NEEDED, RANK_LABEL, earnedRanks, fmtShortDate, homeSuggestions, rankProgress } from "@/lib/advancement";
import { getSettings } from "@/lib/settings";
import { withdrawSubmission } from "../actions";
import SubmissionStatusBadge from "@/components/SubmissionStatusBadge";
import { fmtDay } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/scouts/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: (await scoutFirstName(id)) ?? "Scout" };
}

export default async function ScoutPage({ params, searchParams }: PageProps<"/scouts/[id]">) {
  const me = await requireMember();
  const { id } = await params;
  const { reported } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const scout = await getScout(id);
  if (!scout) notFound();
  const season = seasonOf(todayEastern());
  const range = seasonRange(season)!;
  const [catalog, records, submissions, asOf, settings, meetings, totals] = await Promise.all([
    getCatalog(),
    getRecords([id]),
    getSubmissions({ scoutId: id }),
    getDataAsOf([id]),
    getSettings(),
    getUpcomingMeetings(scout.den ? [scout.den.id] : [], 2),
    getAttendanceTotals(range.from, range.to, id),
  ]);
  const att = totals.get(id) ?? null;
  const mine = scout.family_id === me.family_id;
  const p = scout.den ? rankProgress(scout.den.rank, records, catalog) : null;
  const ranks = earnedRanks(records);
  const open = submissions.filter((s) => s.status !== "recorded");
  const awardsWaiting = records.filter(
    (r) =>
      r.kind !== "requirement" && r.approved && !r.awarded && (r.completed_on ?? "") >= settings.awards_tracked_from,
  ).length;
  const ideas = p && !p.earned ? homeSuggestions(p, catalog) : [];
  // RSVP right here for the family's own scout.
  const rsvps = mine
    ? await Promise.all(meetings.map((m) => myMeetingRsvps(m, [{ id: scout.id, first_name: scout.first_name, den: scout.den }])))
    : meetings.map(() => []);

  return (
    <>
      {reported && (
        <p className="flex items-center gap-2 rounded-2xl border border-mint-200 bg-mint p-3 text-sm font-semibold text-pine">
          <CircleCheck className="h-4 w-4" aria-hidden /> Sent to the den leader for approval.
        </p>
      )}

      <section className="card space-y-3 border-t-4 border-t-pine">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">
            {scout.first_name} {scout.last_name}
          </h1>
          <p className="text-sm text-muted">{scout.den?.name ?? "Not in a den yet"}</p>
        </div>
        {p && (
          <>
            <div className="flex items-end justify-between">
              <span className="text-sm font-bold text-navy">{RANK_LABEL[p.rank]} rank</span>
              <span className="text-2xl font-extrabold text-pine">{p.percent}%</span>
            </div>
            <ProgressBar percent={p.percent} className="h-3" />
            <ProgressSummary p={p} />
          </>
        )}
        {mine && p && !p.earned && (
          <Link href={`/scouts/${id}/report`} className="btn-primary w-full">
            <Plus className="h-4 w-4" aria-hidden /> Report finished requirements
          </Link>
        )}
      </section>

      {meetings.length > 0 && (
        <section className="card space-y-2">
          <h2 className="section-title flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Next den meeting{meetings.length > 1 ? "s" : ""}
          </h2>
          <ul className="space-y-2">
            {meetings.map((m, i) => (
              <li key={m.id} className="space-y-1.5 text-sm">
                <Link href={`/meetings/${m.id}`} className="font-bold text-ink underline-offset-2 hover:underline">
                  {fmtMeetingDate(m.meets_on)}
                  {fmtMeetingTime(m) ? `, ${fmtMeetingTime(m)}` : ""} · {m.title}
                </Link>
                {(meetingAdventures(m).length > 0 || m.location) && (
                  <p className="text-xs text-muted">
                    {[meetingAdventures(m).join(", ") !== m.title ? meetingAdventures(m).join(", ") || null : null, m.location].filter(Boolean).join(" · ")}
                  </p>
                )}
                {m.family_note && <p className="text-navy">{m.family_note}</p>}
                <DenMeetingRsvp meetingId={m.id} scouts={rsvps[i]} compact />
              </li>
            ))}
          </ul>
        </section>
      )}

      {ideas.length > 0 && (
        <section className="card space-y-2 border-l-4 border-l-gold">
          <h2 className="section-title flex items-center gap-1.5">
            <House className="h-3.5 w-3.5" aria-hidden /> Try at home this week
          </h2>
          <ul className="space-y-2.5">
            {ideas.map((a) => (
              <li key={a.name} className="text-sm">
                <p className="font-bold text-ink">
                  {a.name} <span className="text-xs font-normal text-muted">{a.required ? "required" : "elective"}</span>
                </p>
                <p className="text-navy">{a.idea}</p>
                {a.url && (
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-pine underline">
                    Requirements on scouting.org
                  </a>
                )}
              </li>
            ))}
          </ul>
          {mine && (
            <p className="text-[11px] text-muted">When your scout finishes something, report it below so the den leader can approve it.</p>
          )}
        </section>
      )}

      {p && (
        <>
          <section className="card">
            <h2 className="section-title">Required adventures</h2>
            <AdventureList items={p.required} />
          </section>
          <section className="card">
            <h2 className="section-title">
              Electives <span className="font-semibold normal-case tracking-normal">(any {ELECTIVES_NEEDED})</span>
            </h2>
            <AdventureList items={p.electives} empty="No electives started yet." />
          </section>
        </>
      )}

      {open.length > 0 && (
        <section className="card space-y-1">
          <h2 className="section-title">Reported in the app</h2>
          <ul className="divide-y divide-line">
            {open.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-2 py-2.5">
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">
                    {s.adventure} · req {s.requirement}
                  </span>
                  <span className="block text-xs text-muted">Done {fmtShortDate(s.completed_on)}</span>
                  {s.review_note && <span className="block text-xs text-navy">“{s.review_note}”</span>}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <SubmissionStatusBadge status={s.status} />
                  {mine && s.status === "submitted" && (
                    <form action={withdrawSubmission}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="scout_id" value={id} />
                      <SubmitButton className="text-[11px] font-semibold text-muted underline">Withdraw</SubmitButton>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card space-y-2">
        <h2 className="section-title flex items-center gap-1.5">
          <ClipboardCheck className="h-3.5 w-3.5" aria-hidden /> Attendance <span className="font-semibold normal-case tracking-normal">({season} season)</span>
        </h2>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface p-2">
            <dt className="text-[11px] font-bold text-muted">Den meetings</dt>
            <dd className="text-xl font-extrabold text-pine-950">
              {att?.den_meetings ?? 0}
              {att && att.den_meetings_held > 0 && <span className="text-sm font-semibold text-muted"> of {att.den_meetings_held}</span>}
            </dd>
          </div>
          <div className="rounded-xl bg-surface p-2">
            <dt className="text-[11px] font-bold text-muted">Pack events</dt>
            <dd className="text-xl font-extrabold text-pine-950">{att?.events ?? 0}</dd>
          </div>
          <div className="rounded-xl bg-surface p-2">
            <dt className="text-[11px] font-bold text-muted">Camping nights</dt>
            <dd className="text-xl font-extrabold text-pine-950">{att?.nights ?? 0}</dd>
          </div>
        </dl>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Tent className="h-3.5 w-3.5" aria-hidden /> {nightsLabel(att?.nights_all ?? 0)} of camping in all, every season.
        </p>
      </section>

      <section className="card space-y-1">
        <h2 className="section-title">Ranks earned</h2>
        {ranks.length === 0 && <p className="py-1 text-sm text-muted">None yet.</p>}
        <ul className="divide-y divide-line">
          {ranks.map((r) => (
            <li key={r.item + r.version} className="flex items-center gap-3 py-2">
              <Medal className="h-5 w-5 shrink-0 text-gold-700" aria-hidden />
              <span className="flex-1 font-semibold text-ink">{r.item}</span>
              <span className="text-xs text-muted">{fmtShortDate(r.completed_on)}</span>
            </li>
          ))}
        </ul>
        {isLeader(me) && awardsWaiting > 0 && (
          <p className="flex items-center gap-1.5 pt-1 text-xs text-gold-800">
            <Award className="h-3.5 w-3.5" aria-hidden /> {awardsWaiting} approved item{awardsWaiting > 1 ? "s" : ""} not yet
            marked awarded in Scoutbook
          </p>
        )}
      </section>

      {(mine || isLeader(me)) && (
        <Link href={`/scouts/${id}/keepsake`} className="btn-ghost min-h-11 w-full">
          <Printer className="h-4 w-4" aria-hidden /> Season keepsake (print)
        </Link>
      )}

      <p className="text-center text-[11px] text-muted">
        {asOf
          ? `From Scoutbook, updated ${fmtDay(asOf)}. Scoutbook is the official record.`
          : "Scoutbook progress hasn't been loaded yet."}
      </p>
    </>
  );
}
