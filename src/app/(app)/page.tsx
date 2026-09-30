import Link from "next/link";
import SubmitButton from "@/components/SubmitButton";
import { ChevronRight, MapPin, Pin, ShoppingBag, Timer } from "lucide-react";
import EventRow from "@/components/EventRow";
import PostAnnouncement from "@/components/PostAnnouncement";
import { deleteAnnouncement } from "./actions";
import { displayName, getAnnouncements, getMyScouts, getUpcomingEvents, isLeader, requireMember } from "@/lib/data";
import { daysUntil, fmtRange, timeAgo } from "@/lib/format";

export default async function Home() {
  const me = await requireMember();
  const [scouts, events, posts] = await Promise.all([getMyScouts(), getUpcomingEvents(8), getAnnouncements(15)]);
  const next = events[0];
  const rest = events.slice(1, 5);
  const leader = isLeader(me);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
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

      {next && (
        <section className="relative overflow-hidden rounded-3xl bg-pine-950 p-5 text-white shadow-[var(--shadow-float)]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge bg-gold text-pine-950">
              <Timer className="h-3 w-3" aria-hidden /> {daysUntil(next.starts_at)}
            </span>
            <span className="badge bg-white/10 text-mint-200">{next.category}</span>
          </div>
          <h2 className="mt-2 text-xl font-extrabold leading-tight">{next.title}</h2>
          <p className="mt-1 text-sm text-mint-200">{fmtRange(next.starts_at, next.ends_at)}</p>
          {next.location_name && (
            <p className="mt-0.5 flex items-center gap-1 text-sm text-mint-200">
              <MapPin className="h-3.5 w-3.5" aria-hidden /> {next.location_name}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            {next.category === "Campout" ? (
              <Link href={`/campouts/${next.id}`} className="btn-gold">
                Campout details <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : (
              <Link href="/events" className="btn-gold">
                Full calendar <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
            {next.signup_url && (
              <a href={next.signup_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold">
                RSVP / pay
              </a>
            )}
          </div>
        </section>
      )}

      <Link href="/store" className="card flex items-center gap-3 active:bg-surface-low">
        <ShoppingBag className="h-6 w-6 shrink-0 text-gold-700" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-pine-950">Pack store</span>
          <span className="block text-xs text-muted">Pack 361 shirts and hoodies</span>
        </span>
        <ChevronRight className="h-5 w-5 text-muted" aria-hidden />
      </Link>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Pack announcements</h2>
        </div>
        {leader && <PostAnnouncement />}
        {posts.length === 0 && <p className="card text-sm text-muted">No announcements yet.</p>}
        {posts.map((p) => (
          <article key={p.id} className="card space-y-1.5 border-t-4 border-t-pine">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5">
                {p.is_pinned && <Pin className="h-3.5 w-3.5 text-gold-700" aria-label="Pinned" />}
                <span className="badge bg-gold-50 text-gold-700">{p.category}</span>
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
    </>
  );
}
