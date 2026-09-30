import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { Bell, ChevronRight, Megaphone, Pin, Users } from "lucide-react";
import PostAnnouncement from "@/components/PostAnnouncement";
import SubmitButton from "@/components/SubmitButton";
import { displayName, getAnnouncements, isCommittee, isLeader, requireMember } from "@/lib/data";
import { getMessageableDens } from "@/lib/audience";
import { getSeenAt, getTodos } from "@/lib/inbox";
import { packEmailConfigured } from "@/lib/bulk-email";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/format";
import { deleteAnnouncement } from "../actions";

export const metadata: Metadata = { title: "Notifications" };

const TONE = { gold: "border-l-gold", pine: "border-l-pine", danger: "border-l-danger" };

export default async function InboxPage() {
  const me = await requireMember();
  const [todos, posts, seenAt, dens] = await Promise.all([
    getTodos(),
    getAnnouncements(40),
    getSeenAt(),
    isLeader(me) ? getMessageableDens(me) : Promise.resolve([]),
  ]);
  // Mark everything read once this page has been sent (the badge clears on the next page).
  after(async () => {
    const supabase = await createClient();
    await supabase.from("inbox_reads").upsert({ adult_id: me.id, seen_at: new Date().toISOString() });
  });
  const isNew = (iso: string, author: string) => author !== me.id && (!seenAt || iso > seenAt);

  return (
    <>
      <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-pine-950">
        <Bell className="h-6 w-6" aria-hidden /> Notifications
      </h1>

      {todos.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-title">Needs you</h2>
          {todos.map((t) => (
            <Link key={t.key} href={t.href} className={`card flex items-center gap-3 border-l-4 py-3 ${TONE[t.tone]}`}>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-pine-950">{t.title}</span>
                <span className="block text-xs text-muted">{t.detail}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
            </Link>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="section-title">Announcements and den messages</h2>
        {isLeader(me) && <PostAnnouncement dens={dens} canPostPack packEmail={packEmailConfigured()} />}
        {posts.length === 0 && <p className="card text-sm text-muted">Nothing yet. Pack announcements and messages from your den show up here.</p>}
        {posts.map((p) => (
          <article key={p.id} className={`card space-y-1.5 border-t-4 ${p.den_id ? "border-t-navy" : "border-t-pine"}`}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="flex flex-wrap items-center gap-1.5">
                {isNew(p.created_at, p.author_id) && <span className="badge bg-danger text-white">New</span>}
                {p.is_pinned && <Pin className="h-3.5 w-3.5 text-gold-700" aria-label="Pinned" />}
                {p.den ? (
                  <span className="badge bg-navy text-white">
                    <Users className="h-3 w-3" aria-hidden /> {p.den.name}
                  </span>
                ) : (
                  <span className="badge bg-gold-50 text-gold-700">
                    <Megaphone className="h-3 w-3" aria-hidden /> {p.category}
                  </span>
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
      {!isCommittee(me) && !isLeader(me) && (
        <p className="px-1 text-center text-[11px] text-muted">Only pack leaders post here. To reach a leader, use the Leaders tab.</p>
      )}
    </>
  );
}
