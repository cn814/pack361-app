import type { Metadata } from "next";
import Link from "next/link";
import { CameraOff } from "lucide-react";
import BackLink from "@/components/BackLink";
import PhotoUploader from "@/components/PhotoUploader";
import PhotoOptOutList from "@/components/PhotoOptOutList";
import { isLeader, requireMember } from "@/lib/data";
import { getEventBrief, getPhotoOptOuts, getRecentEvents } from "@/lib/photos";
import { fmtDay } from "@/lib/format";

export const metadata: Metadata = { title: "Upload photos" };

export default async function UploadPage({ searchParams }: PageProps<"/photos/upload">) {
  const me = await requireMember();
  const { event } = await searchParams;
  const recent = await getRecentEvents();
  // Opened from an event page for an event that isn't in the recent list yet: include it.
  if (typeof event === "string" && /^[0-9a-f-]{36}$/i.test(event) && !recent.some((e) => e.id === event)) {
    const one = await getEventBrief(event);
    if (one) recent.unshift(one);
  }
  const events = recent.map((e) => ({ id: e.id, title: e.title, when: fmtDay(e.starts_at) }));
  const from = typeof event === "string" ? recent.find((e) => e.id === event) : undefined;
  const fromHref = from ? (from.category === "Campout" ? `/campouts/${from.id}` : `/events/${from.id}`) : null;
  const leader = isLeader(me);
  // Leaders' photos skip review, so they see who opted out first (the same list as Photo review).
  const optOuts = leader ? await getPhotoOptOuts() : [];

  return (
    <>
      <BackLink href={fromHref ?? "/photos"} label={from ? from.title : "Pack photos"} />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Upload photos</h1>
      <p className="-mt-2 text-sm text-muted">
        {leader
          ? optOuts.length
            ? "Your photos go straight into the album once you confirm none of the scouts below are in them; otherwise a leader checks them first."
            : "Your photos go straight into the album."
          : "A leader checks each photo before it appears in the album."}{" "}
        Photos are resized and their location data removed before upload.{" "}
        <Link href="/photos/rules" className="font-semibold text-pine underline">
          Photo rules
        </Link>
      </p>
      {leader && optOuts.length > 0 && (
        <section className="card space-y-2 border-l-4 border-l-danger">
          <h2 className="flex items-center gap-1.5 font-bold text-danger">
            <CameraOff className="h-4 w-4" aria-hidden /> These scouts&apos; families opted out of photos ({optOuts.length})
          </h2>
          <p className="text-xs text-muted">Leaders only; don&apos;t share this list.</p>
          <PhotoOptOutList scouts={optOuts} />
        </section>
      )}
      <section className="card">
        <PhotoUploader
          events={events}
          defaultEventId={typeof event === "string" && events.some((e) => e.id === event) ? event : undefined}
          leader={leader}
          optOutCount={optOuts.length}
          returnTo={fromHref ?? undefined}
        />
      </section>
    </>
  );
}
