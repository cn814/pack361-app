import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Award,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  CircleCheck,
  FileSpreadsheet,
  ClipboardCheck,
  FileText,
  FileUp,
  Grid3x3,
  HandCoins,
  HandHeart,
  Landmark,
  Megaphone,
  MessageSquare,
  NotebookPen,
  Phone,
  Printer,
  Receipt,
  ShieldCheck,
  Stamp,
  Tent,
  Vote,
  type LucideIcon,
} from "lucide-react";
import EventTabs from "@/components/EventTabs";
import { ProgressBar, ProgressSummary } from "@/components/RankProgress";
import { isCommittee, isLeader, requireMember } from "@/lib/data";
import {
  countReviewSubmissions,
  getAwardsToHandOut,
  getCatalog,
  getLastImport,
  getRecords,
  getReviewableScouts,
  isAdmin,
  recordsByScout,
} from "@/lib/advancement-data";
import { rankProgress } from "@/lib/advancement";
import { getMessageableDens } from "@/lib/audience";
import { countWaitingRequests } from "@/lib/finance-data";
import { countWaitingJoins } from "@/lib/roster-data";
import { getTodos } from "@/lib/inbox";
import { getSettings } from "@/lib/settings";
import { REPORTS, myReports, type ReportKey } from "@/lib/reports";
import { getLeaderMeetingsToday, type LeaderMeeting } from "@/lib/meeting-now";
import { LEADER_TODOS, WAITING_LABEL } from "@/lib/leader-todos";
import { fmtTime, timeAgo } from "@/lib/format";
import type { Scout } from "@/lib/types";

export const metadata: Metadata = { title: "Leaders" };

const RANK_ORDER = ["lion", "tiger", "wolf", "bear", "webelos", "aol"];

/**
 * The Leaders tab: everything a leader does, in one place, shown only to leaders. Today
 * (meetings on now with attendance and notes, what's waiting on you, quick actions), then Dens,
 * Events, Money and People. What's here depends on the role; the database checks it either way.
 */
export default async function LeadersHubPage() {
  const me = await requireMember();
  if (!isLeader(me)) redirect("/");
  const committee = isCommittee(me);
  const admin = isAdmin(me);
  const [meetings, todos, toApprove, toRecord, dens, reviewable, settings, lastImport, waiting, joins, catalog, reports] = await Promise.all([
    getLeaderMeetingsToday(),
    getTodos(),
    countReviewSubmissions("submitted"),
    countReviewSubmissions("approved"),
    getMessageableDens(me),
    getReviewableScouts(),
    getSettings(),
    admin ? getLastImport() : Promise.resolve(null),
    committee ? countWaitingRequests() : Promise.resolve(null),
    admin ? countWaitingJoins() : Promise.resolve(0),
    getCatalog(),
    myReports(),
  ]);
  const [recordList, awards] = await Promise.all([
    getRecords(reviewable.map((s) => s.id)),
    getAwardsToHandOut(
      reviewable.map((s) => s.id),
      settings.awards_tracked_from,
    ),
  ]);
  const records = recordsByScout(recordList);

  const leaderTodos = todos.filter((t) => LEADER_TODOS.has(t.key));
  const todo = (key: string) => todos.find((t) => t.key === key);
  const waitingOn: { href: string; count: number | null; label: string }[] = [];
  if (toApprove) waitingOn.push({ href: "/scouts/review", count: toApprove, label: "reports to approve" });
  for (const t of leaderTodos) {
    const n = Number(t.title.match(/^\d+/)?.[0] ?? NaN);
    waitingOn.push({ href: t.href, count: Number.isNaN(n) ? null : n, label: Number.isNaN(n) ? t.title : (WAITING_LABEL[t.key] ?? t.title) });
  }
  const toHandle = waiting ? waiting.toReview + waiting.toPay : 0;
  if (toHandle) waitingOn.push({ href: "/leaders/money/expenses", count: toHandle, label: "expenses to handle" });
  const myDen = dens.length === 1 ? dens[0] : null;

  const today = (
    <>
      <Meetings meetings={meetings} />

      <section className="space-y-2">
        <Heading title="Waiting on you" />
        {waitingOn.length ? (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {waitingOn.map((w) => (
              <Link key={w.href + w.label} href={w.href} className="card py-3">
                {w.count !== null && <span className="block text-2xl font-extrabold text-pine-950">{w.count}</span>}
                <span className="block text-[13px] font-semibold text-ink first-letter:uppercase">{w.label}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="card flex items-center gap-2 text-sm text-muted">
            <CircleCheck className="h-4 w-4 text-pine" aria-hidden /> Nothing waiting on you.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <Heading title="Quick actions" />
        <div className="grid grid-cols-4 gap-2">
          <Action href="/events/new" icon={CalendarPlus} label="Add event" />
          <Action href="/announce" icon={Megaphone} label="Announce" sub="Whole pack" />
          {dens.length > 0 && (
            <Action href={myDen ? `/announce?den=${myDen.id}` : "/announce?den=pick"} icon={MessageSquare} label="Message den" sub={myDen?.name} />
          )}
          <Action href="/polls/new" icon={Vote} label="New poll" />
        </div>
      </section>
    </>
  );

  // Den rosters, grouped by den in rank order.
  const byDen = new Map<string, Scout[]>();
  for (const s of reviewable) {
    const k = s.den?.id ?? "none";
    byDen.set(k, [...(byDen.get(k) ?? []), s]);
  }
  const denGroups = [...byDen.values()].sort((a, b) => {
    const ra = a[0].den ? RANK_ORDER.indexOf(a[0].den.rank) : 9;
    const rb = b[0].den ? RANK_ORDER.indexOf(b[0].den.rank) : 9;
    return ra - rb || (a[0].den?.name ?? "").localeCompare(b[0].den?.name ?? "");
  });

  const denTab = (
    <>
      <Tiles
        items={[
          { href: "/scouts/review", icon: ClipboardCheck, label: "Approve reports", count: toApprove },
          { href: "/scouts/review#record", icon: Stamp, label: "Enter in Scoutbook", count: toRecord },
          { href: "/scouts/awards", icon: Award, label: "Awards to hand out", count: awards.length },
          { href: "/scouts/awards/sheet", icon: Printer, label: "Awards night sheet", note: "Printable, by den" },
          ...(admin
            ? [{ href: "/scouts/import", icon: FileUp, label: "Import Scoutbook", note: lastImport ? `Updated ${timeAgo(lastImport.imported_at)}` : "Never imported" }]
            : []),
        ]}
      />
      <div className="page-wide space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
        {denGroups.map((list) => {
          const den = list[0].den;
          return (
            <section key={den?.id ?? "none"} className="card space-y-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="section-title">{den?.name ?? "No den"}</h2>
                {den && (
                  <span className="flex items-center gap-3">
                    <Link href={`/scouts/den/${den.id}/today`} className="inline-flex items-center gap-1 text-xs font-bold text-pine">
                      <ClipboardCheck className="h-3.5 w-3.5" aria-hidden /> Record
                    </Link>
                    <Link href={`/scouts/den/${den.id}/meetings`} className="inline-flex items-center gap-1 text-xs font-bold text-pine">
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Meetings
                    </Link>
                    <Link href={`/scouts/den/${den.id}`} className="inline-flex items-center gap-1 text-xs font-bold text-pine">
                      <Grid3x3 className="h-3.5 w-3.5" aria-hidden /> Grid
                    </Link>
                  </span>
                )}
              </div>
              <ul className="divide-y divide-line">
                {list.map((s) => {
                  const p = s.den ? rankProgress(s.den.rank, records.get(s.id) ?? [], catalog) : null;
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
          );
        })}
      </div>
      {!denGroups.length && <p className="card text-sm text-muted">No dens are linked to you yet. Pack admin adds den leaders to their dens.</p>}
    </>
  );

  const training = todo("training-import");
  const payments = todo("payments-reported");

  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Leaders</h1>
      <EventTabs
        lead={today}
        label="Leader sections"
        backLabel="Leaders"
        tabs={[
          { id: "dens", label: "Dens", hint: toApprove ? `${toApprove} reports to approve` : "Rosters, approvals, awards", icon: <Award aria-hidden />, content: denTab },
          {
            id: "events",
            label: "Events",
            hint: "Add events, council events, attendance, gear",
            icon: <CalendarPlus aria-hidden />,
            content: (
              <Tiles
                items={[
                  { href: "/events/new", icon: CalendarPlus, label: "Add an event" },
                  { href: "/events/council", icon: Landmark, label: "Council events" },
                  { href: "/leaders/attendance", icon: ClipboardCheck, label: "Attendance", note: "Report and CSV" },
                  { href: "/gear/manage", icon: Tent, label: "Gear requests" },
                  { href: "/polls/new", icon: Vote, label: "New poll" },
                  { href: "/announce", icon: Megaphone, label: "Announce" },
                ]}
              />
            ),
          },
          {
            id: "money",
            label: "Money",
            hint: toHandle ? `${toHandle} expenses to handle` : "Dues, fees, expenses",
            icon: <HandCoins aria-hidden />,
            content: committee ? (
              <Tiles
                items={[
                  { href: "/leaders/money", icon: HandCoins, label: "Money", note: payments?.title, alert: Boolean(payments) },
                  {
                    href: "/leaders/money/expenses",
                    icon: Receipt,
                    label: "Expenses and reports",
                    note: toHandle ? `${toHandle} to handle` : undefined,
                    alert: toHandle > 0,
                  },
                ]}
              />
            ) : null,
          },
          {
            id: "reports",
            label: "Reports",
            hint: "Roster, training, forms, spreadsheets",
            icon: <FileSpreadsheet aria-hidden />,
            content: (
              <>
                <ul className="card divide-y divide-line p-0">
                  {([...reports, "training", "forms"] as ReportKey[]).map((k) => (
                    <li key={k}>
                      <Link href={REPORTS[k].href} className="flex items-center gap-3 px-4 py-3">
                        <FileSpreadsheet className="h-5 w-5 shrink-0 text-pine" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold text-ink">{REPORTS[k].title}</span>
                          <span className="block text-xs text-muted">{REPORTS[k].about}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link href="/leaders/attendance" className="flex items-center gap-3 px-4 py-3">
                      <FileSpreadsheet className="h-5 w-5 shrink-0 text-pine" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-ink">Attendance</span>
                        <span className="block text-xs text-muted">Den meetings, pack events and camping nights for each scout, by season.</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    </Link>
                  </li>
                </ul>
                <p className="text-xs text-muted">
                  Each report has a spreadsheet download.
                  {admin ? " Pack admin → Report access chooses who else can open the roster and membership reports." : ""}
                </p>
              </>
            ),
          },
          {
            id: "people",
            label: "People",
            hint: admin ? "Training, forms, Pack admin" : "Training, medical forms, help wanted",
            icon: <ShieldCheck aria-hidden />,
            content: (
              <>
                <Tiles
                  items={[
                    { href: "/leaders/training", icon: ShieldCheck, label: "Training", note: training ? "Import due" : undefined, alert: Boolean(training) },
                    { href: "/leaders/paperwork", icon: FileText, label: "Medical forms" },
                    { href: "/help-wanted", icon: HandHeart, label: "Help wanted" },
                    { href: "/leaders", icon: Phone, label: "Leader contacts" },
                  ]}
                />
                {admin && (
                  <Link href="/admin" className="flex min-h-12 items-center gap-3 rounded-2xl bg-deep px-4 py-3 text-white">
                    <ShieldCheck className="h-5 w-5 text-gold" aria-hidden />
                    <span className="flex-1 font-extrabold">Pack admin</span>
                    {joins > 0 && <span className="text-xs font-bold text-gold">{joins} asking to join</span>}
                    <ChevronRight className="h-4 w-4 text-mint-200" aria-hidden />
                  </Link>
                )}
              </>
            ),
          },
        ]}
      />
    </>
  );
}

/** Today's meetings: the ones on now first and bold, each one tap from attendance and notes. */
function Meetings({ meetings }: { meetings: LeaderMeeting[] }) {
  if (!meetings.length) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <CalendarDays className="h-4 w-4" aria-hidden /> No meetings today.
      </p>
    );
  }
  return (
    <section className="space-y-2">
      <Heading title="Today's meetings" />
      {meetings.map((m) => {
        const on = m.on;
        return (
          <Link
            key={m.key}
            href={m.href}
            className={`flex min-h-16 items-center gap-3 rounded-3xl px-4 py-3.5 shadow-[var(--shadow-card)] active:brightness-95 ${
              on ? "bg-gold text-on-gold" : "bg-card text-ink"
            }`}
          >
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${on ? "bg-deep" : "bg-mint"}`}>
              <ClipboardCheck className={`h-6 w-6 ${on ? "text-gold" : "text-pine"}`} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-extrabold uppercase tracking-wider">{on ? "On now" : fmtTime(m.starts_at)}</span>
              <span className="block truncate text-lg font-extrabold leading-tight">{m.title}</span>
              <span className="flex items-center gap-1 text-sm">
                {m.saved ? (
                  <>
                    <CircleCheck className="h-4 w-4" aria-hidden /> Recorded. Tap to change it or add notes.
                  </>
                ) : (
                  <>
                    <NotebookPen className="h-4 w-4" aria-hidden /> {m.den ? "Who's here, what you did, notes" : "Attendance and notes"}
                  </>
                )}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
          </Link>
        );
      })}
    </section>
  );
}

interface Tile {
  href: string;
  icon: LucideIcon;
  label: string;
  note?: string;
  alert?: boolean;
  count?: number;
}

function Tiles({ items }: { items: Tile[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
      {items.map((t) => (
        <Link key={t.href + t.label} href={t.href} className="card flex min-h-[4.25rem] flex-col justify-center gap-0.5 py-3 active:bg-surface-low">
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[15px] font-extrabold leading-tight text-pine-950">
              <t.icon className="h-4 w-4 shrink-0 text-pine" aria-hidden /> {t.label}
            </span>
            {t.count !== undefined && <span className={`badge shrink-0 ${t.count ? "bg-gold text-on-gold" : "bg-surface text-muted"}`}>{t.count}</span>}
          </span>
          {t.note && <span className={`text-xs ${t.alert ? "font-bold text-gold-800" : "text-muted"}`}>{t.note}</span>}
        </Link>
      ))}
    </div>
  );
}

function Heading({ title }: { title: string }) {
  return <h2 className="px-0.5 text-base font-extrabold text-pine-950">{title}</h2>;
}

function Action({ href, icon: Icon, label, sub }: { href: string; icon: LucideIcon; label: string; sub?: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-1.5 rounded-2xl py-1 text-center active:bg-mint">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-mint">
        <Icon className="h-6 w-6 text-pine" aria-hidden />
      </span>
      <span className="text-xs font-bold leading-tight text-ink">
        {label}
        {sub && <span className="block text-[11px] font-semibold text-muted">{sub}</span>}
      </span>
    </Link>
  );
}
