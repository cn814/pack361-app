import { fmtDay, fmtTime } from "@/lib/format";
import type { ItineraryItem } from "@/lib/types";

/** An event's schedule, by day. `empty` = what to say when there's none yet (nothing if blank). */
export default function EventSchedule({ items, empty }: { items: ItineraryItem[]; empty?: string }) {
  if (!items.length) return empty ? <p className="card text-sm text-muted">{empty}</p> : null;
  const byDay = new Map<string, ItineraryItem[]>();
  for (const i of items) byDay.set(fmtDay(i.starts_at), [...(byDay.get(fmtDay(i.starts_at)) ?? []), i]);
  return (
    <section id="schedule-list" className="space-y-3">
      {[...byDay.entries()].map(([day, list]) => (
        <div key={day} className="card space-y-3">
          {byDay.size > 1 && <h3 className="font-bold text-pine-950">{day}</h3>}
          <ol className="space-y-3">
            {list.map((i) => (
              <li key={i.id} className="flex gap-3">
                <span className="w-16 shrink-0 text-xs font-bold text-gold-800">{fmtTime(i.starts_at)}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{i.title}</span>
                  {(i.location || i.notes) && <span className="block text-xs text-muted">{[i.location, i.notes].filter(Boolean).join(" · ")}</span>}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}
