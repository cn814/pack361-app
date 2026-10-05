import Link from "next/link";
import { Suspense } from "react";
import GettingStarted from "@/components/GettingStarted";
import HelpWantedCard from "@/components/HelpWantedCard";
import SubmitButton from "@/components/SubmitButton";
import { ChevronRight, HandHelping, MapPin, Timer } from "lucide-react";
import { eventHref, getOpenJobs, jobComesBack } from "@/lib/volunteer";
import EventRow from "@/components/EventRow";
import { eventLinkLabel } from "@/lib/event-link";
import RsvpLink from "@/components/RsvpLink";
import NavigateLink from "@/components/NavigateLink";
import { navDestination } from "@/lib/navigate";
import { ProgressBar } from "@/components/RankProgress";
import { displayName, getAnnouncements, getBigEvent, getMyScouts, getUpcomingEvents, requireMember } from "@/lib/data";
import { getHidden, getTodos } from "@/lib/inbox";
import TodoCard from "@/components/TodoCard";
import { hideTodo } from "./todo-actions";
import { getCatalog, getRecords, recordsByScout } from "@/lib/advancement-data";
import { RANK_LABEL, rankProgress } from "@/lib/advancement";
import { LEADER_TODOS } from "@/lib/leader-todos";
import { daysUntil, eventOver, fmtRange, timeAgo } from "@/lib/format";
import type { CalItem } from "@/lib/calendar";

export default async function Home() {
  const me = await requireMember();
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
      <FamilyHome />
    </>
  );
}

// ---------------------------------------------------------------------------
// What's next, what needs you, your scouts, pack news. (Leader jobs are on the Leaders tab.)
// ---------------------------------------------------------------------------
async function FamilyHome() {
  // Records only need the scouts, not everything else: start them as soon as the scouts arrive.
  const scoutsP = getMyScouts();
  const [scouts, records, events, posts, jobs, todos, big, catalog, hidden] = await Promise.all([
    scoutsP,
    scoutsP.then((list) => getRecords(list.map((s) => s.id))),
    getUpcomingEvents(12, { mine: true, near: true }).then((l) => l.filter((e) => !eventOver(e))),
    getAnnouncements(2),
    getOpenJobs(),
    getTodos(),
    getBigEvent(),
    getCatalog(),
    getHidden(),
  ]);
  const byScout = recordsByScout(records);
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
        <Suspense fallback={null}>
          <GettingStarted />
        </Suspense>
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
        <Suspense fallback={null}>
          <HelpWantedCard />
        </Suspense>

        <PackNews posts={posts} />
      </div>

      <div className="space-y-5">
        {scouts.length > 0 && (
          <section className="space-y-2">
            <Heading title="Your scouts" right={<Link href="/scouts" className="text-sm font-bold text-pine">All</Link>} />
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {scouts.map((s) => {
                const p = s.den ? rankProgress(s.den.rank, byScout.get(s.id) ?? [], catalog) : null;
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
  const navTo = navDestination(e);
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
        {navTo && <NavigateLink to={navTo} className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold" />}
        {e.signup_url && (
          <a href={e.signup_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold">
            {eventLinkLabel(e.signup_url, e.source)}
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
