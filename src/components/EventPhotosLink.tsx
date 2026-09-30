import Link from "next/link";
import { ChevronRight, Images } from "lucide-react";
import { countEventPhotos } from "@/lib/photos";
import { isPast } from "@/lib/format";

/** "Photos from this event" link, once the event has started. */
export default async function EventPhotosLink({ eventId, startsAt }: { eventId: string; startsAt: string }) {
  if (!isPast(startsAt)) return null;
  const count = await countEventPhotos(eventId);
  return (
    <Link href={count ? `/photos?album=${eventId}` : `/photos/upload?event=${eventId}`} className="card flex items-center gap-3 py-3">
      <Images className="h-6 w-6 shrink-0 text-pine" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-pine-950">{count ? `Photos (${count})` : "Add photos from this event"}</span>
        <span className="block text-xs text-muted">Private to Pack 361 families</span>
      </span>
      <ChevronRight className="h-5 w-5 text-muted" aria-hidden />
    </Link>
  );
}
