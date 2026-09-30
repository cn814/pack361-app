import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Lock, LockOpen, Trash2 } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import BackLink from "@/components/BackLink";
import SubmitButton from "@/components/SubmitButton";
import { isAdmin } from "@/lib/advancement-data";
import { isLeader, requireMember } from "@/lib/data";
import { getMyVote, getPoll, getResults, getVoters, isOpen } from "@/lib/polls";
import { fmtDay } from "@/lib/format";
import { deletePoll, setPollClosed, vote } from "../actions";

export const metadata: Metadata = { title: "Poll" };

export default async function PollPage({ params }: PageProps<"/polls/[id]">) {
  const me = await requireMember();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const poll = await getPoll(id);
  if (!poll) notFound();
  const leader = isLeader(me);
  const [results, mine, voters] = await Promise.all([getResults(id), getMyVote(id, me.id), leader ? getVoters(id) : Promise.resolve([])]);
  const open = isOpen(poll);
  const manage = leader && (poll.created_by === me.id || isAdmin(me));
  const max = results ? Math.max(1, ...results.counts) : 1;

  return (
    <>
      <BackLink href="/polls" label="Polls" />
      <section className="card space-y-3">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="badge bg-mint text-pine">{poll.den?.name ?? "Whole pack"}</span>
          <span className={`badge ${open ? "bg-gold-50 text-gold-800" : "bg-surface text-muted"}`}>
            {open ? (poll.closes_at ? `Open until ${fmtDay(poll.closes_at)}` : "Open") : "Closed"}
          </span>
          {poll.one_per_family && <span className="badge bg-surface text-navy">One answer per family</span>}
        </div>
        <h1 className="text-xl font-extrabold leading-tight text-pine-950">{poll.question}</h1>
        {poll.details && <p className="whitespace-pre-line text-sm text-ink">{poll.details}</p>}

        {open && (
          <ActionForm action={vote} submit={mine ? "Change my answer" : "Send my answer"} busy="Sending…" className="space-y-2">
            <input type="hidden" name="poll_id" value={poll.id} />
            <p className="text-xs text-muted">{poll.allow_multiple ? "Pick all that apply." : "Pick one."}</p>
            {poll.options.map((o, i) => (
              <label key={i} className="flex items-center gap-3 rounded-xl border border-line bg-white p-3 has-[:checked]:border-pine has-[:checked]:bg-mint">
                <input
                  type={poll.allow_multiple ? "checkbox" : "radio"}
                  name="choice"
                  value={i}
                  defaultChecked={mine?.includes(i)}
                  required={!poll.allow_multiple}
                  className="h-5 w-5 shrink-0 accent-pine"
                />
                <span className="text-sm font-semibold text-ink">{o}</span>
              </label>
            ))}
          </ActionForm>
        )}
      </section>

      <section className="card space-y-2">
        <h2 className="section-title">Results</h2>
        {results ? (
          <>
            <ul className="space-y-2">
              {poll.options.map((o, i) => {
                const n = results.counts[i] ?? 0;
                return (
                  <li key={i} className="space-y-1">
                    <div className="flex justify-between gap-2 text-sm">
                      <span className={`font-semibold ${mine?.includes(i) ? "text-pine" : "text-ink"}`}>
                        {o}
                        {mine?.includes(i) ? " (you)" : ""}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted">{n}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface">
                      <div className="h-full rounded-full bg-pine" style={{ width: `${(n / max) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted">
              {results.voters} {results.voters === 1 ? "person has" : "people have"} answered.
              {poll.results_visible === "leaders" ? " Only leaders see these results." : ""}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">
            {poll.results_visible === "leaders" ? "Only leaders see the results of this poll." : "Answer to see how everyone else answered."}
          </p>
        )}
      </section>

      {leader && voters.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-bold text-pine">Who answered what (leaders only)</summary>
          <ul className="divide-y divide-line pt-2 text-sm">
            {voters.map((v, i) => (
              <li key={i} className="flex justify-between gap-3 py-1.5">
                <span className="font-semibold text-ink">{v.name}</span>
                <span className="text-right text-muted">{v.choices.map((c) => poll.options[c]).join(", ")}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {manage && (
        <div className="grid grid-cols-2 gap-2">
          <form action={setPollClosed}>
            <input type="hidden" name="poll_id" value={poll.id} />
            <input type="hidden" name="close" value={open ? "1" : "0"} />
            <SubmitButton className="btn-ghost w-full py-2">
              {open ? <Lock className="h-4 w-4" aria-hidden /> : <LockOpen className="h-4 w-4" aria-hidden />}
              {open ? "Close poll" : "Reopen"}
            </SubmitButton>
          </form>
          <form action={deletePoll}>
            <input type="hidden" name="poll_id" value={poll.id} />
            <SubmitButton className="btn-ghost w-full border-danger py-2 text-danger">
              <Trash2 className="h-4 w-4" aria-hidden /> Delete
            </SubmitButton>
          </form>
        </div>
      )}
    </>
  );
}
