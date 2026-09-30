import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, ClipboardCheck, ImagePlus, Lock } from "lucide-react";
import BackLink from "@/components/BackLink";
import { isLeader, requireMember } from "@/lib/data";
import { countMyPending, countPendingPhotos, getAlbumPhotos, getAlbums } from "@/lib/photos";
import { fmtDay } from "@/lib/format";

export const metadata: Metadata = { title: "Pack photos" };

export default async function PhotosPage({ searchParams }: PageProps<"/photos">) {
  const me = await requireMember();
  const { album, flagged } = await searchParams;
  const leader = isLeader(me);
  const key = typeof album === "string" && (album === "other" || /^[0-9a-f-]{36}$/i.test(album)) ? album : null;

  if (key) {
    const photos = await getAlbumPhotos(key);
    const title = photos[0]?.event?.title ?? (key === "other" ? "Around the pack" : "Album");
    return (
      <>
        <BackLink href="/photos" label="All albums" />
        <div className="flex items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">{title}</h1>
            <p className="text-sm text-muted">
              {photos.length} photo{photos.length === 1 ? "" : "s"}
              {photos[0]?.event ? ` · ${fmtDay(photos[0].event.starts_at)}` : ""}
            </p>
          </div>
          <Link href={`/photos/upload${key !== "other" ? `?event=${key}` : ""}`} className="btn-ghost shrink-0 px-3 py-2">
            <ImagePlus className="h-4 w-4" aria-hidden /> Add
          </Link>
        </div>
        {photos.length === 0 ? (
          <p className="card text-sm text-muted">No photos here yet.</p>
        ) : (
          <ul className="page-wide grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
            {photos.map((p) => (
              <li key={p.id}>
                <Link href={`/photos/${p.id}`} className="block aspect-square overflow-hidden rounded-lg bg-surface">
                  {p.thumb_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumb_url} alt={p.caption ?? ""} loading="lazy" className="h-full w-full object-cover" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  const [albums, pending, mine] = await Promise.all([
    getAlbums(),
    leader ? countPendingPhotos() : Promise.resolve(0),
    countMyPending(me.id),
  ]);

  return (
    <>
      <div className="flex items-end justify-between gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Pack photos</h1>
        <Link href="/photos/upload" className="btn-primary shrink-0 px-3 py-2">
          <ImagePlus className="h-4 w-4" aria-hidden /> Upload
        </Link>
      </div>
      <p className="-mt-2 flex items-center gap-1.5 text-xs text-muted">
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden /> Only signed-in Pack 361 families see these.{" "}
        <Link href="/photos/rules" className="font-semibold text-pine underline">
          Photo rules
        </Link>
      </p>

      {flagged && (
        <p className="flex items-center gap-2 rounded-2xl border border-mint-200 bg-mint p-3 text-sm font-semibold text-pine">
          <CircleCheck className="h-4 w-4 shrink-0" aria-hidden /> Thanks. That photo is hidden until a leader reviews it.
        </p>
      )}
      {leader && pending > 0 && (
        <Link href="/photos/review" className="card flex items-center gap-3 border-l-4 border-l-gold py-3">
          <ClipboardCheck className="h-5 w-5 text-gold-700" aria-hidden />
          <span className="flex-1 font-bold text-pine-950">
            {pending} photo{pending === 1 ? "" : "s"} to review
          </span>
        </Link>
      )}
      {mine > 0 && (
        <p className="text-sm text-muted">
          {mine} of your photo{mine === 1 ? " is" : "s are"} waiting for a leader to review.
        </p>
      )}

      {albums.length === 0 ? (
        <p className="card text-sm text-muted">No photos yet. Be the first to add some from a pack event.</p>
      ) : (
        <ul className="page-wide grid grid-cols-2 gap-3 lg:grid-cols-4">
          {albums.map((a) => (
            <li key={a.key}>
              <Link href={`/photos?album=${a.key}`} className="block overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow-card)]">
                <div className="aspect-[4/3] bg-surface">
                  {a.cover.thumb_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.cover.thumb_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="p-2.5">
                  <p className="truncate text-sm font-bold text-ink">{a.title}</p>
                  <p className="text-[11px] text-muted">
                    {a.count} photo{a.count === 1 ? "" : "s"}
                    {a.date ? ` · ${fmtDay(a.date)}` : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
