import Link from "next/link";
import SubmitButton from "@/components/SubmitButton";
import {
  CalendarPlus,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  HandHelping,
  MapPin,
  Megaphone,
  MessageSquare,
  Timer,
  Vote,
  type LucideIcon,
} from "lucide-react";
import { eventHref, getOpenJobs, jobComesBack } from "@/lib/volunteer";
import EventRow from "@/components/EventRow";
import RsvpLink from "@/components/RsvpLink";
import ModeSwitch from "@/components/ModeSwitch";
import { ProgressBar } from "@/components/RankProgress";
import { displayName, getAnnouncements, getBigEvent, getMyScouts, getUpcomingEvents, requireMember } from "@/lib/data";
import { getMessageableDens } from "@/lib/audience";
import { getHidden, getTodos } from "@/lib/inbox";
import TodoCard from "@/components/TodoCard";
import { hideTodo } from "./todo-actions";
import { myDenMeetingButtons } from "@/lib/meetings";
import { getCatalog, getRecords, getReviewableScouts, getSubmissions } from "@/lib/advancement-data";
import { RANK_LABEL, rankProgress } from "@/lib/advancement";
import { canLead, getMode } from "@/lib/mode";
import { daysUntil, eventOver, fmtRange, timeAgo } from "@/lib/format";
import type { CalItem } from "@/lib/calendar";

/** To-dos that are a leader's job (the rest are their own family's). */
const LEADER_TODOS = new Set(["join-requests", "photos", "forms-waiting", "payments-reported", "notes", "training-import"]);
const WAITING_LABEL: Record<string, string> = {
  "join-requests": "asking to join",
  photos: "photos to review",
  "forms-waiting": "medical forms turned in",
  "payments-reported": "payments to confirm",
  notes: "messages from families",
};

export default async function Home() {
  const me = await requireMember();
  const mode = await getMode(me);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{greeting}</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">{displayName(me)}</h1>
        </div>
      </div>
      {canLead(me) && (
        <div className="lg:hidden">
          <ModeSwitch mode={mode} />
        </div>
      )}
      {mode === "leader" ? <LeaderHome /> : <FamilyHome />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Family: what's next, what needs you, your scouts, pack news
// ---------------------------------------------------------------------------
async function FamilyHome() {
  const [scouts, events, posts, jobs, todos, big, catalog, hidden] = await Promise.all([
    getMyScouts(),
    getUpcomingEvents(12, { mine: true }).then((l) => l.filter((e) => !eventOver(e))),
    getAnnouncements(2),
    getOpenJobs(),
    getTodos(),
    getBigEvent(),
    getCatalog(),
    getHidden(),
  ]);
  const records = await getRecords(scouts.map((s) => s.id));
  const openJobs = jobs.filter((j) => !hidden.has(`job-${j.slot_id}`));
  // The pack's big event is pinned while it's coming up; otherwise whatever's next.
  // Once it's over (the bottom bar keeps it a few more days), fall back to what's next.
  const pinned = big && !eventOver(big.event) ? big : null;
  const next = pinned?.event ?? events[0];
  const mine = todos.filter((t) => !LEADER_TODOS.has(t.key));
  // The big card already has an RSVP button for its event, so don't list it again below.
  const todoList = next ? mine.filter((t) => t.key !== `rsvp-${next.id}` || t.rsvp?.today) : mine;
  const rest = events.filter((e) => e.id !== next?.id).slice(0, 3);

  return (
    <div className="page-wide flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-7">
      <div className="space-y-5">
        {next && <NextUp e={next} label={pinned ? pinned.label : null} />}

        {todoList.length > 0 && (
          <section className="space-y-2">
            <Heading title="To do" right={<span className="text-xs text-muted">{todoList.length}</span>} />
            {todoList.slice(0, 3).map((t) => (
              <TodoCard key={t.key} t={t} />
            ))}
            {todoList.length > 3 && (
              <Link href="/inbox" prefetch={false} className="block px-1 text-sm font-bold text-pine">
                {todoList.length - 3} more →
              </Link>
            )}
          </section>
        )}

        {openJobs.length > 0 && <Volunteers jobs={openJobs} />}

        <PackNews posts={posts} />
      </div>

      <div className="space-y-5">
        {scouts.length > 0 && (
          <section className="space-y-2">
            <Heading title="Your scouts" right={<Link href="/scouts" className="text-sm font-bold text-pine">All</Link>} />
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {scouts.map((s) => {
                const p = s.den ? rankProgress(s.den.rank, records.filter((r) => r.scout_id === s.id), catalog) : null;
                return (
                  <Link key={s.id} href={`/scouts/${s.id}`} className="card space-y-1.5 py-3">
                    <span className="block text-[15px] font-extrabold text-pine-950">{s.first_name}</span>
                    <span className="block text-xs text-muted">
                      {s.den ? (p?.earned ? `${RANK_LABEL[s.den.rank]} rank earned` : `${s.den.name} · ${p?.percent ?? 0}% to rank`) : "Not in a den yet"}
                    </span>
                    {p && <ProgressBar percent={p.earned ? 100 : p.percent} />}
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {rest.length > 0 && (
          <section className="space-y-2">
            <Heading title="Coming up" right={<Link href="/events" className="text-sm font-bold text-pine">Calendar</Link>} />
            {rest.map((e) => (
              <EventRow key={e.id} e={e} />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leader: tonight's meeting, what's waiting on you, quick actions
// ---------------------------------------------------------------------------
async function LeaderHome() {
  const me = await requireMember();
  const [todos, denButtons, dens, events, posts, reviewable, submitted] = await Promise.all([
    getTodos(),
    myDenMeetingButtons(),
    getMessageableDens(me),
    getUpcomingEvents(10).then((l) => l.filter((e) => !eventOver(e)).slice(0, 6)),
    getAnnouncements(2),
    getReviewableScouts(),
    getSubmissions({ status: ["submitted"] }),
  ]);
  const reviewIds = new Set(reviewable.map((s) => s.id));
  const toApprove = submitted.filter((s) => reviewIds.has(s.scout_id)).length;
  const leaderTodos = todos.filter((t) => LEADER_TODOS.has(t.key));
  const familyCount = todos.length - leaderTodos.length;

  const waiting: { href: string; count: number | null; label: string }[] = [];
  if (toApprove) waiting.push({ href: "/scouts/review", count: toApprove, label: "reports to approve" });
  for (const t of leaderTodos) {
    const n = Number(t.title.match(/^\d+/)?.[0] ?? NaN);
    waiting.push({ href: t.href, count: Number.isNaN(n) ? null : n, label: Number.isNaN(n) ? t.title : (WAITING_LABEL[t.key] ?? t.title) });
  }
  const myDen = dens.length === 1 ? dens[0] : null;

  return (
    <div className="page-wide flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-7">
      <div className="space-y-5">
        {denButtons.map((d) => (
          <Link
            key={d.denId}
            href={`/scouts/den/${d.denId}/today`}
            className="flex min-h-16 items-center gap-3 rounded-3xl bg-gold px-4 py-4 text-on-gold shadow-[var(--shadow-card)] active:brightness-95"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-deep">
              <ClipboardCheck className="h-6 w-6 text-gold" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-extrabold uppercase tracking-wider">{d.today ? "Tonight" : "Den meeting"}</span>
              <span className="block text-lg font-extrabold leading-tight">Record the {d.name} meeting</span>
              <span className="flex items-center gap-1 text-sm">
                {d.saved ? (
                  <>
                    <CircleCheck className="h-4 w-4" aria-hidden /> Saved. Tap to change it.
                  </>
                ) : (
                  "Who's here and what you did"
                )}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
          </Link>
        ))}

        <section className="space-y-2">
          <Heading title="Waiting on you" />
          {waiting.length ? (
            <div className="grid grid-cols-2 gap-2">
              {waiting.map((w) => (
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
          {familyCount > 0 && (
            <Link href="/inbox" prefetch={false} className="block px-1 text-sm font-semibold text-pine">
              Your family has {familyCount} to-do{familyCount === 1 ? "" : "s"} →
            </Link>
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
      </div>

      <div className="space-y-5">
        {events.length > 0 && (
          <section className="space-y-2">
            <Heading title="Coming up" right={<Link href="/events" className="text-sm font-bold text-pine">Calendar</Link>} />
            {events.slice(0, 4).map((e) => (
              <EventRow key={e.id} e={e} />
            ))}
          </section>
        )}
        <PackNews posts={posts} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
function Heading({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between px-0.5">
      <h2 className="text-base font-extrabold text-pine-950">{title}</h2>
      {right}
    </div>
  );
}

function NextUp({ e, label }: { e: CalItem; label: string | null }) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-deep p-5 text-white shadow-[var(--shadow-float)]">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-gold">
          <Timer className="h-3.5 w-3.5" aria-hidden /> Next up · {daysUntil(e.starts_at, e.ends_at)}
        </span>
        <span className="text-xs text-mint-200">{label ?? e.den_name ?? e.category}</span>
      </div>
      <h2 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight">{e.title}</h2>
      <p className="mt-1 text-sm text-mint-200">{fmtRange(e.starts_at, e.ends_at, e.all_day)}</p>
      {e.location_name && (
        <p className="mt-0.5 flex items-center gap-1 text-sm text-mint-200">
          <MapPin className="h-3.5 w-3.5" aria-hidden /> {e.location_name}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <RsvpLink e={e} variant="dark" />
        <Link href={e.href} className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold">
          Details <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
        {e.signup_url && (
          <a href={e.signup_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold">
            {e.source === "council" ? "Register with the council" : "Sign up / pay"}
          </a>
        )}
      </div>
    </section>
  );
}

function Volunteers({ jobs }: { jobs: Awaited<ReturnType<typeof getOpenJobs>> }) {
  const later = jobs.filter((j) => jobComesBack(j.event.starts_at));
  return (
    <section className="card space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-base font-extrabold text-pine-950">
          <HandHelping className="h-4 w-4 text-pine" aria-hidden /> Volunteers needed
        </h2>
        {later.length > 0 && (
          <form action={hideTodo}>
            {later.map((j) => (
              <span key={j.slot_id}>
                <input type="hidden" name="key" value={`job-${j.slot_id}`} />
                <input type="hidden" name="until" value={jobComesBack(j.event.starts_at)} />
              </span>
            ))}
            <SubmitButton className="rounded-lg px-2 py-1 text-[11px] font-bold text-muted underline">Not now</SubmitButton>
          </form>
        )}
      </div>
      <ul className="divide-y divide-line">
        {jobs.map((j) => (
          <li key={j.slot_id}>
            <Link href={`${eventHref(j.event)}#volunteer`} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">
                  {j.role_title}
                  {j.is_urgent && <span className="badge ml-2 bg-gold text-on-gold">Needed</span>}
                </span>
                <span className="block truncate text-xs text-muted">
                  {j.event.title} · {daysUntil(j.event.starts_at).toLowerCase()} · {j.open} open
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PackNews({ posts }: { posts: Awaited<ReturnType<typeof getAnnouncements>> }) {
  return (
    <section className="space-y-2">
      <Heading title="Pack news" right={<Link href="/inbox" prefetch={false} className="text-sm font-bold text-pine">See all</Link>} />
      {posts.length === 0 && <p className="card text-sm text-muted">No announcements yet.</p>}
      {posts.map((p) => (
        <Link key={p.id} href="/inbox" prefetch={false} className="card block space-y-0.5 py-3">
          <span className="block font-bold text-ink">{p.title}</span>
          <span className="line-clamp-2 block text-sm text-muted">{p.body}</span>
          <span className="block text-xs text-muted">
            {p.den ? `${p.den.name} · ` : ""}
            {p.author ? displayName(p.author) : "Pack 361"} · {timeAgo(p.created_at)}
          </span>
        </Link>
      ))}
    </section>
  );
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

