import Link from "next/link";
import SubmitButton from "@/components/SubmitButton";
import { BookOpen, ChevronRight, CircleCheck, ClipboardCheck, HandHelping, Images, MapPin, Pin, ShoppingBag, Timer, Users, Vote } from "lucide-react";
import { eventHref, getOpenJobs, jobComesBack } from "@/lib/volunteer";
import EventRow from "@/components/EventRow";
import RsvpLink from "@/components/RsvpLink";
import PostAnnouncement from "@/components/PostAnnouncement";
import { deleteAnnouncement } from "./actions";
import { displayName, getAnnouncements, getMyScouts, getUpcomingEvents, isLeader, requireMember } from "@/lib/data";
import { getMessageableDens } from "@/lib/audience";
import { getHidden, getTodos } from "@/lib/inbox";
import TodoCard from "@/components/TodoCard";
import { hideTodo } from "./todo-actions";
import { myDenMeetingButtons } from "@/lib/meetings";
import { packEmailConfigured } from "@/lib/bulk-email";
import { daysUntil, fmtRange, timeAgo } from "@/lib/format";

export default async function Home() {
  const me = await requireMember();
  const [scouts, events, posts, jobs, todos, dens, denButtons] = await Promise.all([
    getMyScouts(),
    getUpcomingEvents(8),
    getAnnouncements(15),
    getOpenJobs(),
    getTodos(),
    isLeader(me) ? getMessageableDens(me) : Promise.resolve([]),
    myDenMeetingButtons(),
  ]);
  // Volunteer jobs someone hid with "Not now" come back two days before the event.
  const hidden = await getHidden();
  const openJobs = jobs.filter((j) => !hidden.has(`job-${j.slot_id}`));
  const comeBack = jobComesBack;
  const next = events[0];
  // The big card already has an RSVP button for the next event, so don't list it again below.
  const todoList = next ? todos.filter((t) => t.key !== `rsvp-${next.id}` || t.rsvp?.today) : todos;
  const rest = events.slice(1, 5);
  const leader = isLeader(me);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <div className="page-wide flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
        <div className="contents lg:block lg:space-y-4">
        <div className="order-1 empty:hidden">
          <section>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Welcome back</p>
            <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">
              {greeting}, {displayName(me)}
            </h1>
            {scouts.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {scouts.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/scouts/${s.id}`}
                      className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-sm font-semibold text-navy active:bg-surface-low"
                    >
                      <span className="h-2 w-2 rounded-full bg-gold" aria-hidden />
                      {s.first_name}
                      {s.den && <span className="font-normal text-muted">· {s.den.name}</span>}
                      <ChevronRight className="h-3.5 w-3.5 text-muted" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <div className="order-2 empty:hidden">
          {denButtons.length > 0 && (
            <div className="mb-4 space-y-2">
              {denButtons.map((d) => (
                <Link
                  key={d.denId}
                  href={`/scouts/den/${d.denId}/today`}
                  className="flex min-h-16 items-center gap-3 rounded-3xl border-2 border-pine bg-mint px-4 py-4 text-pine-950 active:bg-mint-200"
                >
                  <ClipboardCheck className="h-7 w-7 shrink-0 text-pine" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-extrabold leading-tight">
                      {d.today ? `Today's ${d.name} meeting` : `Record a den meeting · ${d.name}`}
                    </span>
                    <span className="flex items-center gap-1 text-sm text-pine">
                      {d.saved ? (
                        <>
                          <CircleCheck className="h-4 w-4" aria-hidden /> Saved. Tap to change it.
                        </>
                      ) : (
                        "Tap who's here and what you did."
                      )}
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-pine" aria-hidden />
                </Link>
              ))}
            </div>
          )}
          {next && (
            <section className="relative overflow-hidden rounded-3xl bg-pine-950 p-5 text-white shadow-[var(--shadow-float)]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge bg-gold text-pine-950">
                  <Timer className="h-3 w-3" aria-hidden /> {daysUntil(next.starts_at, next.ends_at)}
                </span>
                <span className="badge bg-white/10 text-mint-200">{next.category}</span>
                {next.den_name && <span className="badge bg-white/10 text-gold">{next.den_name}</span>}
              </div>
              <h2 className="mt-2 text-xl font-extrabold leading-tight">{next.title}</h2>
              <p className="mt-1 text-sm text-mint-200">{fmtRange(next.starts_at, next.ends_at, next.all_day)}</p>
              {next.location_name && (
                <p className="mt-0.5 flex items-center gap-1 text-sm text-mint-200">
                  <MapPin className="h-3.5 w-3.5" aria-hidden /> {next.location_name}
                </p>
              )}
              <div className="mt-4 flex gap-2">
                <Link href={next.href} className="btn-gold">
                  {next.category === "Campout" ? "Campout details" : next.kind === "meeting" ? "Meeting details" : "Details"} <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
                <RsvpLink e={next} variant="dark" />
                {next.signup_url && (
                  <a href={next.signup_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold">
                    {next.source === "council" ? "Register with the council" : "Sign up / pay"}
                  </a>
                )}
              </div>
            </section>
          )}
        </div>
        <div className="order-6 empty:hidden">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="section-title">Pack announcements</h2>
            </div>
            {leader && <PostAnnouncement dens={dens} packEmail={packEmailConfigured()} />}
            {posts.length === 0 && <p className="card text-sm text-muted">No announcements yet.</p>}
            {posts.map((p) => (
              <article key={p.id} className={`card space-y-1.5 border-t-4 ${p.den_id ? "border-t-navy" : "border-t-pine"}`}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5">
                    {p.is_pinned && <Pin className="h-3.5 w-3.5 text-gold-700" aria-label="Pinned" />}
                    {p.den ? (
                      <span className="badge bg-navy text-white">
                        <Users className="h-3 w-3" aria-hidden /> {p.den.name}
                      </span>
                    ) : (
                      <span className="badge bg-gold-50 text-gold-700">{p.category}</span>
                    )}
                  </span>
                  <span className="text-muted">{timeAgo(p.created_at)}</span>
                </div>
                <h3 className="font-bold text-ink">{p.title}</h3>
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{p.body}</p>
                <div className="flex items-center justify-between pt-1 text-xs text-muted">
                  <span>
                    {p.author ? `${displayName(p.author)} ${p.author.last_name}` : "Pack 361"}
                    {p.author?.position_title ? ` · ${p.author.position_title.split(",")[0]}` : ""}
                  </span>
                  {(p.author_id === me.id || me.role === "admin" || me.role === "cubmaster") && (
                    <form action={deleteAnnouncement}>
                      <input type="hidden" name="id" value={p.id} />
                      <SubmitButton className="font-semibold text-danger/80 underline">Delete</SubmitButton>
                    </form>
                  )}
                </div>
              </article>
            ))}
          </section>
        </div>
        </div>
        <div className="contents lg:block lg:space-y-4">
        <div className="order-3 empty:hidden">
          {todoList.length > 0 && (
            <section className="space-y-2">
              {todoList.slice(0, 3).map((t) => (
                <TodoCard key={t.key} t={t} />
              ))}
              {todoList.length > 3 && (
                <Link href="/inbox" prefetch={false} className="block px-1 text-xs font-bold text-pine">
                  {todoList.length - 3} more in Notifications →
                </Link>
              )}
            </section>
          )}
        </div>
        <div className="order-4 empty:hidden">
          {openJobs.length > 0 && (
            <section className="card space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="section-title flex items-center gap-1.5">
                  <HandHelping className="h-4 w-4" aria-hidden /> Volunteers needed
                </h2>
                {openJobs.some((j) => comeBack(j.event.starts_at)) && (
                  <form action={hideTodo}>
                    {openJobs
                      .filter((j) => comeBack(j.event.starts_at))
                      .map((j) => (
                        <span key={j.slot_id}>
                          <input type="hidden" name="key" value={`job-${j.slot_id}`} />
                          <input type="hidden" name="until" value={comeBack(j.event.starts_at)} />
                        </span>
                      ))}
                    <SubmitButton className="rounded-lg px-2 py-1 text-[11px] font-bold text-muted underline">Not now</SubmitButton>
                  </form>
                )}
              </div>
              <ul className="divide-y divide-line">
                {openJobs.map((j) => (
                  <li key={j.slot_id}>
                    <Link href={`${eventHref(j.event)}#volunteer`} className="flex items-center gap-2 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">
                          {j.role_title}
                          {j.is_urgent && <span className="badge ml-2 bg-gold text-pine-950">Needed</span>}
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
          )}
        </div>
        <div className="order-5 empty:hidden">
          <div className="grid grid-cols-2 gap-2">
            <Link href="/guide" className="card flex items-center gap-2 py-3">
              <BookOpen className="h-5 w-5 shrink-0 text-pine" aria-hidden />
              <span className="font-bold text-pine-950">Pack guide</span>
            </Link>
            <Link href="/polls" className="card flex items-center gap-2 py-3">
              <Vote className="h-5 w-5 shrink-0 text-pine" aria-hidden />
              <span className="font-bold text-pine-950">Polls</span>
            </Link>
            <Link href="/photos" className="card flex items-center gap-2 py-3">
              <Images className="h-5 w-5 shrink-0 text-pine" aria-hidden />
              <span className="font-bold text-pine-950">Pack photos</span>
            </Link>
            <Link href="/store" className="card flex items-center gap-2 py-3">
              <ShoppingBag className="h-5 w-5 shrink-0 text-gold-700" aria-hidden />
              <span className="font-bold text-pine-950">Pack store</span>
            </Link>
          </div>
        </div>
        <div className="order-7 empty:hidden">
          {rest.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="section-title">Coming up</h2>
                <Link href="/events" className="text-xs font-bold text-pine">All events →</Link>
              </div>
              {rest.map((e) => (
                <EventRow key={e.id} e={e} />
              ))}
            </section>
          )}
        </div>
        </div>
      </div>
    </>
  );
}
