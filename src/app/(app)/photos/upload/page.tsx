import type { Metadata } from "next";
import Link from "next/link";
import BackLink from "@/components/BackLink";
import PhotoUploader from "@/components/PhotoUploader";
import { isLeader, requireMember } from "@/lib/data";
import { getRecentEvents } from "@/lib/photos";
import { fmtDay } from "@/lib/format";

export const metadata: Metadata = { title: "Upload photos" };

export default async function UploadPage({ searchParams }: PageProps<"/photos/upload">) {
  const me = await requireMember();
  const { event } = await searchParams;
  const recent = await getRecentEvents();
  const events = recent.map((e) => ({ id: e.id, title: e.title, when: fmtDay(e.starts_at) }));
  const leader = isLeader(me);

  return (
    <>
      <BackLink href="/photos" label="Pack photos" />
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Upload photos</h1>
      <p className="-mt-2 text-sm text-muted">
        {leader
          ? "Your photos go straight into the album."
          : "A leader checks each photo before it appears in the album."}{" "}
        Photos are resized and their location data removed before upload.{" "}
        <Link href="/photos/rules" className="font-semibold text-pine underline">
          Photo rules
        </Link>
      </p>
      <section className="card">
        <PhotoUploader
          events={events}
          defaultEventId={typeof event === "string" && events.some((e) => e.id === event) ? event : undefined}
          leader={leader}
        />
      </section>
    </>
  );
}
