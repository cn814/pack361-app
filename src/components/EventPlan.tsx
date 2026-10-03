import PackingChecklist from "@/components/PackingChecklist";
import { getItinerary } from "@/lib/data";
import { getOwnPackingList } from "@/lib/event-builder-data";
import { fmtDay, fmtTime } from "@/lib/format";

/**
 * Schedule and packing list for an event that isn't a campout (campout pages show their own).
 * Shows only what a leader added in the builder; nothing at all when there's neither.
 */
export default async function EventPlan({ eventId }: { eventId: string }) {
  const [itinerary, packing] = await Promise.all([getItinerary(eventId), getOwnPackingList(eventId)]);
  if (!itinerary.length && !packing.length) return null;
  const byDay = new Map<string, typeof itinerary>();
  for (const i of itinerary) byDay.set(fmtDay(i.starts_at), [...(byDay.get(fmtDay(i.starts_at)) ?? []), i]);
  return (
    <>
      {itinerary.length > 0 && (
        <section id="schedule" className="scroll-mt-20 space-y-3">
          <h2 className="section-title">Schedule</h2>
          {[...byDay.entries()].map(([day, items]) => (
            <div key={day} className="card space-y-3">
              {byDay.size > 1 && <h3 className="font-bold text-pine-950">{day}</h3>}
              <ol className="space-y-3">
                {items.map((i) => (
                  <li key={i.id} className="flex gap-3">
                    <span className="w-16 shrink-0 text-xs font-bold text-gold-800">{fmtTime(i.starts_at)}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">{i.title}</span>
                      {(i.location || i.notes) && (
                        <span className="block text-xs text-muted">{[i.location, i.notes].filter(Boolean).join(" · ")}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      )}
      {packing.length > 0 && (
        <section id="packing" className="scroll-mt-20 space-y-3">
          <h2 className="section-title">What to bring</h2>
          <PackingChecklist eventId={eventId} items={packing} />
        </section>
      )}
    </>
  );
}
