import Link from "next/link";
import { HandCoins, Pencil } from "lucide-react";
import RsvpCard from "@/components/RsvpCard";
import ChargeLine, { type EventCharge } from "@/components/ChargeLine";
import { getMyScouts, isLeader } from "@/lib/data";
import { getRsvp, rsvpOpen } from "@/lib/rsvp";
import { getMyCharges } from "@/lib/payments";
import { costLabel, hasFee } from "@/lib/money";
import { fmtShortDate } from "@/lib/advancement";
import type { Adult, PackEvent } from "@/lib/types";

/** The viewer's charge for this event (not canceled), if any. */
async function myEventCharge(e: PackEvent, me: Adult): Promise<EventCharge | null> {
  const c = (await getMyCharges(me)).find((x) => x.event_id === e.id);
  return c ? { status: c.status, amount_cents: c.amount_cents, paid_amount_cents: c.paid_amount_cents } : null;
}

/** The RSVP card for an event that takes RSVPs in the app (or just the cost, when it doesn't). */
export async function EventRsvp({ e, me }: { e: PackEvent; me: Adult }) {
  const fee = hasFee(e);
  if (!e.rsvp_enabled) return fee ? <EventCost e={e} me={me} /> : null;
  const leader = isLeader(me);
  const [data, scouts, charge] = await Promise.all([getRsvp(e.id, me, leader), getMyScouts(), fee ? myEventCharge(e, me) : null]);
  // Suggest the scouts the event is for: that den's, or everyone's.
  const mineForEvent = e.den_id ? scouts.filter((s) => s.den?.id === e.den_id) : scouts;
  return (
    <RsvpCard
      eventId={e.id}
      open={rsvpOpen(e)}
      deadline={e.rsvp_by ? fmtShortDate(e.rsvp_by) : null}
      mine={data.mine}
      counts={data.counts}
      defaultScouts={mineForEvent.length || scouts.length}
      hasFamily={Boolean(me.family_id)}
      rows={leader ? data.rows : undefined}
      cost={fee ? costLabel(e) : null}
      charge={charge}
    />
  );
}

/** An event with a cost but no RSVP in the app: what it costs, and Pay now if a leader added a charge. */
async function EventCost({ e, me }: { e: PackEvent; me: Adult }) {
  const charge = await myEventCharge(e, me);
  return (
    <section className="card space-y-2 border-l-4 border-l-gold">
      <h2 className="section-title flex items-center gap-1.5">
        <HandCoins className="h-4 w-4" aria-hidden /> Cost
      </h2>
      <p className="text-sm text-ink">{costLabel(e)}</p>
      <ChargeLine charge={charge} />
    </section>
  );
}

/** Leaders: edit this event. */
export function EditEventLink({ e, me }: { e: PackEvent; me: Adult }) {
  if (!isLeader(me)) return null;
  return (
    <Link href={`/events/${e.id}/edit`} className="btn-ghost w-full py-2 text-sm">
      <Pencil className="h-4 w-4" aria-hidden /> Edit event
    </Link>
  );
}
