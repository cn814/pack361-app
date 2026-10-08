import { MessageCircle } from "lucide-react";
import ActionForm, { Field } from "@/components/ActionForm";
import { saveEventSignal } from "@/app/(app)/events/actions";
import { getEventSignal } from "@/lib/event-signal";
import { isLeader } from "@/lib/data";
import { rsvpOpen } from "@/lib/rsvp";
import type { Adult, PackEvent } from "@/lib/types";

/**
 * The event's Signal group. Families going (RSVP yes) get a Join button; others see that there
 * is one and that answering yes gets them the link; leaders add, change or remove the link.
 */
export default async function EventSignal({ e, me, view = "family" }: { e: PackEvent; me: Adult; view?: "family" | "leaders" }) {
  // `leaders` is the setup card for the Leaders only box; everyone (leaders too) gets the Join card.
  const leader = view === "leaders";
  if (leader && !isLeader(me)) return null;
  if (e.category === "Den Meeting") return null; // the den has its own ways to reach families
  if (!e.rsvp_enabled && !leader) return null;
  const { url, exists } = await getEventSignal(e.id);
  return <EventSignalView eventId={e.id} leader={leader} rsvp={Boolean(e.rsvp_enabled)} url={url} exists={exists} open={rsvpOpen(e)} />;
}

export function EventSignalView({
  eventId,
  leader,
  rsvp,
  url,
  exists,
  open,
}: {
  eventId: string;
  leader: boolean;
  rsvp: boolean;
  url: string | null;
  exists: boolean;
  open: boolean;
}) {
  if (leader) {
    if (!rsvp && !url) return null;
    const form = (
        <ActionForm action={saveEventSignal} submit="Save" buttonClass="btn-primary px-5 py-2" className="space-y-3 pt-2">
          <input type="hidden" name="event_id" value={eventId} />
          <Field
            label="Signal group link"
            hint={`In Signal, open the group, tap its name, then Group link, and copy it. Turn on “Approve new members” there too, so you see who joins.${url ? " Clear the box and save to remove the link." : ""}`}
          >
            <input
              className="input"
              name="url"
              type="text"
              inputMode="url"
              maxLength={1000}
              defaultValue={url ?? ""}
              placeholder="https://signal.group/#…"
              autoComplete="off"
            />
          </Field>
        </ActionForm>
    );
    return (
      <section className="card space-y-3 border-l-4 border-l-navy">
        <Title />
        {url ? (
          <>
            <p className="text-sm text-ink">Families who RSVP yes see a Join the Signal group button here.</p>
            <a href={url} target="_blank" rel="noopener noreferrer" className="btn-ghost py-2">
              Open in Signal
            </a>
          </>
        ) : (
          <p className="text-sm text-ink">
            Paste the event&rsquo;s Signal group link, and families who RSVP yes get a Join the Signal group button. Messages you send
            to the families going will point them to it.
          </p>
        )}
        <p className="rounded-xl bg-gold-50 p-3 text-xs text-gold-800">
          <b>Youth protection:</b> Adults only: don&rsquo;t add scouts&rsquo; phone numbers. Remove families who change to not going, and
          reset the group link after the event.
        </p>
        {url ? (
          <details>
            <summary className="cursor-pointer text-sm font-bold text-pine">Change or remove the link</summary>
            {form}
          </details>
        ) : (
          form
        )}
      </section>
    );
  }

  if (url) {
    return (
      <section className="card space-y-2 border-l-4 border-l-navy">
        <Title />
        <p className="text-sm text-ink">Questions and day-of updates for this event happen in the pack&rsquo;s Signal group.</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn-primary py-2">
          <MessageCircle className="h-4 w-4" aria-hidden /> Join the Signal group
        </a>
        <p className="text-xs text-muted">
          Needs the Signal app.{" "}
          <a href="https://signal.org/download/" target="_blank" rel="noopener noreferrer" className="font-bold text-pine underline">
            Get Signal
          </a>
        </p>
      </section>
    );
  }

  if (exists && open) {
    return (
      <p className="card flex items-start gap-2 text-sm text-muted">
        <MessageCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          This event has a Signal group. <a href="#rsvp" className="font-bold text-pine underline">RSVP yes</a> to get the link.
        </span>
      </p>
    );
  }
  return null;
}

function Title() {
  return (
    <h2 className="section-title flex items-center gap-1.5">
      <MessageCircle className="h-4 w-4" aria-hidden /> Signal group
    </h2>
  );
}
