import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Navigation, Ticket } from "lucide-react";
import PackingChecklist from "@/components/PackingChecklist";
import { getEvent, getItinerary, getPackingList, requireMember } from "@/lib/data";
import { fmtDay, fmtRange, fmtTime, mapsLink } from "@/lib/format";

export const metadata: Metadata = { title: "Campout" };

export default async function CampoutPage({ params }: PageProps<"/campouts/[id]">) {
  await requireMember();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const event = await getEvent(id);
  if (!event) notFound();
  const [itinerary, packing] = await Promise.all([getItinerary(id), getPackingList(id)]);

  const byDay = new Map<string, typeof itinerary>();
  for (const i of itinerary) byDay.set(fmtDay(i.starts_at), [...(byDay.get(fmtDay(i.starts_at)) ?? []), i]);
  const place = [event.location_name, event.address].filter(Boolean).join(", ");

  return (
    <>
      <section className="card space-y-2 border-t-4 border-t-pine">
        <span className="badge bg-mint text-pine">{event.category}</span>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-pine-950">{event.title}</h1>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <CalendarDays className="h-4 w-4" aria-hidden /> {fmtRange(event.starts_at, event.ends_at)}
        </p>
        {place && (
          <p className="flex items-start gap-1.5 text-sm text-muted">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {place}
          </p>
        )}
        {event.details && <p className="whitespace-pre-line pt-1 text-sm text-ink">{event.details}</p>}
        <div className="flex flex-wrap gap-2 pt-2">
          {place && (
            <a href={mapsLink(place)} target="_blank" rel="noopener noreferrer" className="btn-ghost py-2">
              <Navigation className="h-4 w-4" aria-hidden /> Directions
            </a>
          )}
          {event.signup_url && (
            <a href={event.signup_url} target="_blank" rel="noopener noreferrer" className="btn-gold py-2">
              <Ticket className="h-4 w-4" aria-hidden /> RSVP / pay
            </a>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="section-title">Schedule</h2>
        {itinerary.length === 0 ? (
          <p className="card text-sm text-muted">The camping chair hasn&apos;t posted the schedule yet.</p>
        ) : (
          [...byDay.entries()].map(([day, items]) => (
            <div key={day} className="card space-y-3">
              <h3 className="font-bold text-pine-950">{day}</h3>
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
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="section-title">Packing checklist</h2>
        <PackingChecklist eventId={event.id} items={packing} />
      </section>
    </>
  );
}
