import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import PostAnnouncement from "@/components/PostAnnouncement";
import { isLeader, requireMember } from "@/lib/data";
import { eventRsvpCounts, getMessageableDens } from "@/lib/audience";
import { getEventSignal } from "@/lib/event-signal";
import { getEvent } from "@/lib/data";
import { packEmailConfigured } from "@/lib/bulk-email";

export const metadata: Metadata = { title: "Announce" };

/** Leader Home's quick actions: Announce (whole pack) and Message den. */
export default async function AnnouncePage({ searchParams }: PageProps<"/announce">) {
  const me = await requireMember();
  if (!isLeader(me)) redirect("/");
  const { den, event: eventId } = await searchParams;
  const event = typeof eventId === "string" && /^[0-9a-f-]{36}$/i.test(eventId) ? await getEvent(eventId) : null;
  if (event) {
    const [counts, signal] = await Promise.all([eventRsvpCounts(event.id), getEventSignal(event.id)]);
    const back = event.category === "Campout" ? `/campouts/${event.id}` : `/events/${event.id}`;
    return (
      <>
        <BackLink href={back} label={event.title} />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Message families going</h1>
          <p className="text-sm text-muted">
            {event.title}: {counts.yes} {counts.yes === 1 ? "family" : "families"} said yes
            {counts.maybe ? `, ${counts.maybe} maybe` : ""}. They get a phone alert (and email if you tick it).
          </p>
        </div>
        <PostAnnouncement
          dens={[]}
          event={{ id: event.id, title: event.title, yes: counts.yes, maybe: counts.maybe, signal: signal.exists }}
          startOpen
          doneHref={back}
        />
      </>
    );
  }
  const dens = await getMessageableDens(me);
  const chosen = typeof den === "string" ? dens.find((d) => d.id === den) : undefined;
  const toDen = den === "pick" || Boolean(chosen);
  const heading = chosen ? `Message ${chosen.name} families` : toDen ? "Message a den" : "Announce to the whole pack";
  const sub = chosen
    ? `Every family with a scout in ${chosen.name} gets it in the app (and by email if you tick it).`
    : toDen
      ? "Pick the den below. Only that den's families get it."
      : "Every family in the pack gets it in the app, with a phone alert, and by email if you tick it.";

  return (
    <>
      <BackLink href="/" label="Home" />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">{heading}</h1>
        <p className="text-sm text-muted">{sub}</p>
      </div>
      <PostAnnouncement
        dens={dens}
        canPostPack
        defaultDen={chosen?.id ?? (toDen ? (dens[0]?.id ?? "") : "")}
        packEmail={packEmailConfigured()}
        startOpen
        doneHref="/inbox"
      />
    </>
  );
}
