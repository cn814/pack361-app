import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plus, Vote } from "lucide-react";
import { isLeader, requireMember } from "@/lib/data";
import { getPolls, getVotedPollIds, isOpen } from "@/lib/polls";
import { fmtDay } from "@/lib/format";

export const metadata: Metadata = { title: "Polls" };

export default async function PollsPage() {
  const me = await requireMember();
  const [polls, voted] = await Promise.all([getPolls(), getVotedPollIds(me)]);
  const open = polls.filter(isOpen);
  const closed = polls.filter((p) => !isOpen(p));
  const row = (p: (typeof polls)[number]) => (
    <li key={p.id}>
      <Link href={`/polls/${p.id}`} className="flex items-center gap-3 py-2.5">
        <Vote className="h-5 w-5 shrink-0 text-pine" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-pine-950">{p.question}</span>
          <span className="block text-xs text-muted">
            {p.den?.name ?? "Whole pack"} · {isOpen(p) ? (p.closes_at ? `closes ${fmtDay(p.closes_at)}` : "open") : "closed"}
          </span>
        </span>
        {voted.has(p.id) ? (
          <span className="badge bg-mint text-pine">Answered</span>
        ) : (
          isOpen(p) && <span className="badge bg-gold text-on-gold">Answer</span>
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </Link>
    </li>
  );
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Polls</h1>
      <p className="-mt-2 text-sm text-muted">Quick questions from pack leaders. Tap one to answer.</p>
      {isLeader(me) && (
        <Link href="/polls/new" className="btn-primary py-2">
          <Plus className="h-4 w-4" aria-hidden /> New poll
        </Link>
      )}
      <section className="space-y-2">
        <h2 className="section-title">Open</h2>
        {open.length ? <ul className="card divide-y divide-line py-1">{open.map(row)}</ul> : <p className="card text-sm text-muted">No open polls right now.</p>}
      </section>
      {closed.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-title">Closed</h2>
          <ul className="card divide-y divide-line py-1">{closed.map(row)}</ul>
        </section>
      )}
    </>
  );
}
