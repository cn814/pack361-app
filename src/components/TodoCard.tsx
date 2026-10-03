import Link from "next/link";
import { ChevronRight } from "lucide-react";
import SubmitButton from "@/components/SubmitButton";
import { hideTodo, quickRsvp } from "@/app/(app)/todo-actions";
import type { Todo } from "@/lib/inbox";

const TONE: Record<Todo["tone"], string> = { gold: "border-l-gold", pine: "border-l-pine", danger: "border-l-danger" };
const small = "rounded-lg px-3 py-1.5 text-xs font-bold";
// All three answers look the same until someone picks one: nothing is chosen for them.
const answer = `${small} border border-pine/40 bg-card text-pine`;

/** One to-do on Home or in the bell: RSVPs can be answered right here; polls can wait ("Not now"). */
export default function TodoCard({ t }: { t: Todo }) {
  if (t.rsvp) {
    return (
      <div className={`card space-y-2 border-l-4 py-3 ${TONE[t.tone]}`}>
        <Link href={t.href} className="flex items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-pine-950">{t.title}</span>
            <span className="block text-xs text-muted">{t.detail}</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
        </Link>
        <form action={quickRsvp} className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-muted">{t.rsvp.today ? "You said maybe:" : "Not answered yet:"}</span>
          <input type="hidden" name="event_id" value={t.rsvp.eventId} />
          {t.rsvp.paid ? (
            <Link href={t.href} className={answer}>
              Going…
            </Link>
          ) : (
            <SubmitButton name="status" value="yes" className={answer}>
              Going
            </SubmitButton>
          )}
          {!t.rsvp.today && (
            <SubmitButton name="status" value="maybe" className={answer}>
              Maybe
            </SubmitButton>
          )}
          <SubmitButton name="status" value="no" className={answer}>
            Can&apos;t make it
          </SubmitButton>
        </form>
        {!t.rsvp.today && <p className="text-[11px] text-muted">Maybe asks again on the day of the event.</p>}
      </div>
    );
  }
  return (
    <div className={`card flex items-center gap-3 border-l-4 py-3 ${TONE[t.tone]}`}>
      <Link href={t.href} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-pine-950">{t.title}</span>
          <span className="block text-xs text-muted">{t.detail}</span>
        </span>
        {!t.hide && <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />}
      </Link>
      {t.hide && (
        <form action={hideTodo}>
          <input type="hidden" name="key" value={t.hide.key} />
          <input type="hidden" name="until" value={t.hide.until ?? ""} />
          <SubmitButton className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-muted underline">Not now</SubmitButton>
        </form>
      )}
    </div>
  );
}
