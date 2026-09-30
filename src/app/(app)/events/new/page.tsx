import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BackLink from "@/components/BackLink";
import EventForm from "@/components/EventForm";
import { isLeader, requireMember } from "@/lib/data";
import { getDens } from "@/lib/roster-data";

export const metadata: Metadata = { title: "New event" };

export default async function NewEventPage() {
  const me = await requireMember();
  if (!isLeader(me)) redirect("/events");
  const dens = await getDens(false);
  return (
    <>
      <BackLink href="/events" label="Calendar" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">New event</h1>
      <section className="card">
        <EventForm dens={dens.map((d) => ({ id: d.id, name: d.name }))} />
      </section>
    </>
  );
}
