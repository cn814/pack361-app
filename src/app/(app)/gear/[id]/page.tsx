import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BackLink from "@/components/BackLink";
import ActionForm, { Field } from "@/components/ActionForm";
import { getUpcomingEvents, requireMember } from "@/lib/data";
import { fmtShortDate } from "@/lib/advancement";
import { defaultDueOn, gearToday, getGearItem } from "@/lib/gear";
import { easternDate } from "@/lib/tz";
import { requestGear } from "../actions";

export const metadata: Metadata = { title: "Borrow gear" };

export default async function BorrowGearPage({ params }: PageProps<"/gear/[id]">) {
  const me = await requireMember();
  const { id } = await params;
  const [item, events] = await Promise.all([getGearItem(id), getUpcomingEvents(40, { mine: true })]);
  if (!item || !item.active) notFound();
  const today = gearToday();
  const upcoming = events.filter((e) => e.kind === "event").slice(0, 20);

  return (
    <>
      <BackLink href="/gear" label="Gear closet" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">{item.name}</h1>
      <section className="card space-y-1.5">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">{item.category}</p>
        {item.description && <p className="whitespace-pre-line text-sm text-ink">{item.description}</p>}
        {item.condition_note && <p className="text-sm text-navy">Condition: {item.condition_note}</p>}
        <p className={`text-sm font-bold ${item.available ? "text-pine" : "text-gold-800"}`}>
          {item.available
            ? `${item.available} of ${item.quantity} free right now`
            : `All ${item.quantity} are lent out right now. You can still ask for a later date.`}
        </p>
      </section>

      {!me.family_id ? (
        <p className="card text-sm text-muted">
          Gear is lent to families, and your login isn&apos;t linked to a family on the roster. Ask a leader for help.
        </p>
      ) : (
        <>
          <h2 className="section-title px-1">Ask to borrow</h2>
          <ActionForm action={requestGear} submit="Send request" busy="Sending…" resetOnSuccess={false} className="card space-y-3">
            <input type="hidden" name="item_id" value={item.id} />
            {item.quantity > 1 && (
              <Field label="How many">
                <input className="input" type="number" name="quantity" inputMode="numeric" min={1} max={item.quantity} defaultValue={1} required />
              </Field>
            )}
            <Field label="For a pack event (optional)">
              <select className="input" name="event_id" defaultValue="">
                <option value="">Not for a pack event</option>
                {upcoming.map((e) => (
                  <option key={e.id} value={e.id}>
                    {`${e.title} · ${fmtShortDate(easternDate(e.starts_at))}`}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pick up (optional)">
                <input className="input" type="date" name="needed_on" min={today} />
              </Field>
              <Field label="Bring back by">
                <input className="input" type="date" name="due_on" min={today} defaultValue={defaultDueOn()} required />
              </Field>
            </div>
            <Field label="Anything else? (optional)">
              <textarea className="input min-h-20" name="note" maxLength={500} placeholder="e.g. We'll pick it up at the pack meeting" />
            </Field>
            <p className="text-xs text-muted">The quartermaster sees your family name and this note, and you&apos;ll get a phone alert with the answer.</p>
          </ActionForm>
        </>
      )}
    </>
  );
}
