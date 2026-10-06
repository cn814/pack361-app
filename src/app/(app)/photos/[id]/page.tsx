import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Flag, ShieldCheck } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import BackLink from "@/components/BackLink";
import { isLeader, requireMember } from "@/lib/data";
import { getAlbumNeighbors, getPhoto } from "@/lib/photos";
import PhotoPager from "@/components/PhotoPager";
import { fmtDay } from "@/lib/format";
import { flagPhoto } from "../actions";
import FacebookCheck from "@/components/FacebookCheck";
import { getPhotoPeople, getPhotoSocialStatus, getSocialAccess, getSocialScouts } from "@/lib/facebook";

export const metadata: Metadata = { title: "Photo" };

export default async function PhotoPage({ params }: PageProps<"/photos/[id]">) {
  const me = await requireMember();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const photo = await getPhoto(id);
  if (!photo) notFound();
  const [nav, social] = await Promise.all([getAlbumNeighbors(photo), getSocialAccess()]);
  // Leaders and the pack's Facebook helpers: can this photo go on the pack's Facebook page?
  const fb =
    social && photo.status === "approved"
      ? await Promise.all([getPhotoSocialStatus([photo.id]), getSocialScouts(), getPhotoPeople(photo.id)]).then(([st, scouts, inPhoto]) => ({
          status: st.get(photo.id),
          scouts,
          inPhoto,
        }))
      : null;
  const album = photo.event_id ?? "other";
  const leader = isLeader(me);
  // Only leaders remove photos (from Photo review). Everyone else asks for removal.
  const canRequest = photo.status === "approved" || photo.uploader_id === me.id || leader;

  return (
    <>
      <BackLink href={`/photos?album=${album}`} label={photo.event?.title ?? "Around the pack"} />
      {photo.status !== "approved" && (
        <p className="rounded-2xl border border-gold-100 bg-gold-50 p-3 text-sm text-gold-800">Waiting for a leader to review.</p>
      )}
      <figure className="space-y-2">
        {photo.full_url && (
          <PhotoPager key={photo.id} prev={nav.prev} next={nav.next} index={nav.index} total={nav.total}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.full_url} alt={photo.caption ?? "Pack photo"} draggable={false} className="w-full rounded-2xl bg-surface" />
          </PhotoPager>
        )}
        <figcaption className="px-1">
          {photo.caption && <p className="font-semibold text-ink">{photo.caption}</p>}
          <p className="text-xs text-muted">
            {photo.event ? `${photo.event.title} · ` : ""}added {fmtDay(photo.created_at)}
          </p>
        </figcaption>
      </figure>

      <div className="flex gap-2">
        {photo.full_url && (
          <a href={`${photo.full_url}&download=pack361-photo.jpg`} className="btn-ghost flex-1 py-2">
            <Download className="h-4 w-4" aria-hidden /> Save
          </a>
        )}
        {leader && photo.status !== "approved" && (
          <Link href="/photos/review" className="btn-ghost flex-1 py-2">
            <ShieldCheck className="h-4 w-4" aria-hidden /> Review
          </Link>
        )}
      </div>
      <p className="px-1 text-[11px] text-muted">
        Please keep pack photos within the pack. Don&apos;t post them on public social media; the pack&apos;s Facebook page only uses
        photos where every family said yes.
      </p>
      {fb && <FacebookCheck photoId={photo.id} status={fb.status} scouts={fb.scouts} inPhoto={fb.inPhoto} />}

      {canRequest && (
        <details className="card">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-danger">
            <Flag className="h-4 w-4" aria-hidden /> Request removal
          </summary>
          <div className="pt-3">
            <ActionForm action={flagPhoto} submit="Send request" busy="Sending…" buttonClass="btn-ghost w-full border-danger text-danger">
              <input type="hidden" name="id" value={photo.id} />
              <textarea className="input min-h-20" name="reason" placeholder="Why? (optional, only leaders see this)" maxLength={500} />
              <p className="text-[11px] text-muted">
                The photo is hidden from families right away, and a leader removes it. Photos can&apos;t be deleted from the
                album directly.
              </p>
            </ActionForm>
          </div>
        </details>
      )}
      <p className="text-center text-xs">
        <Link href="/photos/rules" className="font-semibold text-pine underline">
          Photo rules
        </Link>
      </p>
    </>
  );
}
