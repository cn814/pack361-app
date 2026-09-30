import type { Metadata } from "next";
import EventRow from "@/components/EventRow";
import { getUpcomingEvents, requireMember } from "@/lib/data";
import { getSignupSummaries } from "@/lib/signups";

export const metadata: Metadata = { title: "Campouts" };

export default async function CampoutsPage() {
  const me = await requireMember();
  const signups = await getSignupSummaries(me.family_id);
  const campouts = (await getUpcomingEvents(100)).filter((e) => e.category === "Campout");
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Campouts</h1>
      {campouts.length === 0 && <p className="card text-sm text-muted">No campouts scheduled right now.</p>}
      {campouts.map((e) => (
        <EventRow key={e.id} e={e} signup={signups.get(e.id)} />
      ))}
    </>
  );
}
