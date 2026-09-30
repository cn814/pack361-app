import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Flag, Trash2 } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import BackLink from "@/components/BackLink";
import SubmitButton from "@/components/SubmitButton";
import { isLeader, requireMember } from "@/lib/data";
import { getPhoto } from "@/lib/photos";
import { fmtDay } from "@/lib/format";
import { deletePhoto, flagPhoto } from "../actions";

export const metadata: Metadata = { title: "Photo" };

export default async function PhotoPage({ params }: PageProps<"/photos/[id]">) {
  const me = await requireMember();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const photo = await getPhoto(id);
  if (!photo) notFound();
  const album = photo.event_id ?? "other";
  const canDelete = isLeader(me) || (photo.uploader_id === me.id && photo.status === "pending_review");

  return (
    <>
      <BackLink href={`/photos?album=${album}`} label={photo.event?.title ?? "Around the pack"} />
      {photo.status !== "approved" && (
        <p className="rounded-2xl border border-gold-100 bg-gold-50 p-3 text-sm text-gold-800">Waiting for a leader to review.</p>
      )}
      <figure className="space-y-2">
        {photo.full_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.full_url} alt={photo.caption ?? "Pack photo"} className="w-full rounded-2xl bg-surface" />
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
        {canDelete && (
          <form action={deletePhoto} className="flex-1">
            <input type="hidden" name="id" value={photo.id} />
            <input type="hidden" name="back" value={`/photos?album=${album}`} />
            <SubmitButton className="btn-ghost w-full border-danger py-2 text-danger">
              <Trash2 className="h-4 w-4" aria-hidden /> Delete
            </SubmitButton>
          </form>
        )}
      </div>
      <p className="px-1 text-[11px] text-muted">Please keep pack photos within the pack. Don&apos;t post them on public social media.</p>

      {photo.status === "approved" && (
        <details className="card">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-danger">
            <Flag className="h-4 w-4" aria-hidden /> Ask to take this photo down
          </summary>
          <div className="pt-3">
            <ActionForm action={flagPhoto} submit="Send request" busy="Sending…" buttonClass="btn-ghost w-full border-danger text-danger">
              <input type="hidden" name="id" value={photo.id} />
              <textarea className="input min-h-20" name="reason" placeholder="Why? (optional, only leaders see this)" maxLength={500} />
              <p className="text-[11px] text-muted">The photo is hidden right away until a leader looks at it.</p>
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
