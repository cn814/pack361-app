import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import EventForm from "@/components/EventForm";
import { isLeader, requireMember } from "@/lib/data";
import { getDens } from "@/lib/roster-data";
import { getEventFormScouts } from "@/lib/event-scouts";
import { getDocuments } from "@/lib/documents";

export const metadata: Metadata = { title: "New event" };

export default async function NewEventPage() {
  const me = await requireMember();
  if (!isLeader(me)) redirect("/events");
  const [dens, docs, scouts] = await Promise.all([getDens(false), getDocuments(), getEventFormScouts()]);
  return (
    <>
      <BackLink href="/lead#events" label="Leaders" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">New event</h1>
      <section className="card">
        <EventForm
          dens={dens.map((d) => ({ id: d.id, name: d.name }))}
          scouts={scouts}
          documents={docs.filter((d) => d.audience === "everyone").map((d) => ({ id: d.id, title: d.title }))}
        />
      </section>
    </>
  );
}
