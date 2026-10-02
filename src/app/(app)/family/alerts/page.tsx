import type { Metadata } from "next";
import BackLink from "@/components/BackLink";
import PushToggle from "@/components/PushToggle";
import InstallHelp from "@/components/InstallHelp";
import { requireMember } from "@/lib/data";

export const metadata: Metadata = { title: "Phone alerts" };

export default async function AlertsPage() {
  await requireMember();
  return (
    <>
      <BackLink href="/family" label="Me" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Phone alerts and the app</h1>
      <section className="card space-y-3">
        <h2 className="section-title">Phone alerts</h2>
        <p className="text-sm text-muted">
          Get phone alerts for pack announcements, reminders for jobs you volunteer for, and (for leaders) training renewals.
        </p>
        <PushToggle />
      </section>
      <InstallHelp compact />
    </>
  );
}
