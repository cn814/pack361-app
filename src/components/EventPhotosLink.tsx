import Link from "next/link";
import { Camera, Images } from "lucide-react";
import { countEventPhotos } from "@/lib/photos";

/** Photos for one event: take or add photos, and see the album once there are some. */
export default async function EventPhotosLink({ eventId }: { eventId: string; startsAt?: string }) {
  const count = await countEventPhotos(eventId);
  return (
    <section className="card space-y-2">
      <h2 className="section-title flex items-center gap-1.5">
        <Images className="h-4 w-4" aria-hidden /> Photos
      </h2>
      <div className="flex gap-2">
        <Link href={`/photos/upload?event=${eventId}`} className="btn-primary flex-1 py-2">
          <Camera className="h-4 w-4" aria-hidden /> Take or add photos
        </Link>
        {count > 0 && (
          <Link href={`/photos?album=${eventId}`} className="btn-ghost flex-1 py-2">
            See album ({count})
          </Link>
        )}
      </div>
      <p className="text-[11px] text-muted">Only signed-in Pack 361 families see pack photos.</p>
    </section>
  );
}
