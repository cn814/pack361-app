import Link from "next/link";
import { HandCoins, Hourglass, Pencil, Users } from "lucide-react";
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
  const [data, scouts, charge] = await Promise.all([getRsvp(e.id, me, false), getMyScouts(), fee ? myEventCharge(e, me) : null]);
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
      cost={fee ? costLabel(e) : null}
      charge={charge}
    />
  );
}

/** Leaders: every family's answer, then the waitlist in line order. */
export async function EventRsvpLeaders({ e, me }: { e: PackEvent; me: Adult }) {
  if (!e.rsvp_enabled || !isLeader(me)) return null;
  const { rows, counts } = await getRsvp(e.id, me, true);
  const answered = rows.filter((r) => !r.waitlisted);
  const order = { yes: 0, maybe: 1, no: 2 } as Record<string, number>;
  answered.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || a.name.localeCompare(b.name));
  const waitlist = rows.filter((r) => r.waitlisted);
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="section-title flex items-center gap-1.5">
          <Users className="h-4 w-4" aria-hidden /> Who&apos;s going
        </h2>
        <p className="text-sm text-muted">
          <b className="text-ink">{counts.families_yes}</b> {counts.families_yes === 1 ? "family" : "families"} going ({people(counts.scouts, counts.adults, counts.siblings)})
          {counts.families_maybe ? ` · ${counts.families_maybe} maybe` : ""}
        </p>
      </div>
      {answered.some((r) => r.fromGivebutter) && (
        <p className="text-xs text-muted">
          <b>Paid</b>: marked going from the family&apos;s payment (Givebutter tickets are counted by name; PayPal or other payments count their scouts and one adult). If a count looks off, the family can change it.
        </p>
      )}
      {answered.length ? (
        <ul className="divide-y divide-line text-sm">
          {answered.map((r, i) => (
            <li key={i} className="flex items-start justify-between gap-3 py-1.5">
              <span className="min-w-0">
                <span className="font-semibold text-ink">{r.name}</span>
                {r.fromGivebutter && <span className="ml-1.5 rounded-full bg-mint px-1.5 py-0.5 text-[10px] font-bold text-pine">Paid</span>}
                {r.note && <span className="block text-xs text-muted">“{r.note}”</span>}
              </span>
              <span className="shrink-0 text-right text-xs text-muted">
                <b className={r.status === "yes" ? "text-pine" : r.status === "maybe" ? "text-gold-800" : "text-muted"}>
                  {ANSWER[r.status as keyof typeof ANSWER] ?? r.status}
                </b>
                {r.status !== "no" && <span className="block">{people(r.scouts, r.adults, r.siblings)}</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No family has answered yet.</p>
      )}
      {waitlist.length > 0 && (
        <div className="space-y-1 border-t border-line pt-2">
          <p className="flex items-center gap-1.5 text-xs font-bold text-gold-800">
            <Hourglass className="h-3.5 w-3.5" aria-hidden /> Waitlist, in order
          </p>
          <ol className="divide-y divide-line text-sm">
            {waitlist.map((r, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-1.5">
                <span className="min-w-0">
                  <span className="font-semibold text-ink">
                    #{i + 1} {r.name}
                  </span>
                  {r.note && <span className="block text-xs text-muted">“{r.note}”</span>}
                </span>
                <span className="shrink-0 text-right text-xs text-muted">{people(r.scouts, r.adults, r.siblings)}</span>
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-muted">They move in on their own, in this order, when spots open, and get an alert.</p>
        </div>
      )}
    </section>
  );
}

const ANSWER = { yes: "Going", maybe: "Maybe", no: "Can't go" } as const;
const people = (scouts: number, adults: number, siblings = 0) =>
  [`${scouts} scout${scouts === 1 ? "" : "s"}`, siblings ? `${siblings} sibling${siblings === 1 ? "" : "s"}` : "", `${adults} adult${adults === 1 ? "" : "s"}`]
    .filter(Boolean)
    .join(" · ");

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
