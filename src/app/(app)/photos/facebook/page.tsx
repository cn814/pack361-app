import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleAlert, CircleCheck, CircleHelp, Users } from "lucide-react";
import BackLink from "@/components/BackLink";
import EventTabs from "@/components/EventTabs";
import { requireMember } from "@/lib/data";
import { byDen, getPhotoSocialStatus, getSocialAccess, getSocialScouts } from "@/lib/facebook";
import { getRecentPhotos, type Photo } from "@/lib/photos";
import { facebookState, type PhotoSocialStatus } from "@/lib/photo-permission";

export const metadata: Metadata = { title: "Facebook photos" };

/**
 * For leaders and the pack's Facebook helpers: which album photos can go on the pack's public
 * Facebook page, which still need checking, and which families said yes.
 */
export default async function FacebookPhotosPage() {
  await requireMember();
  if (!(await getSocialAccess())) notFound();
  const [photos, status, scouts] = await Promise.all([getRecentPhotos(), getPhotoSocialStatus(), getSocialScouts()]);
  const ready = photos.filter((p) => facebookState(status.get(p.id)) === "ok");
  const notOk = photos.filter((p) => facebookState(status.get(p.id)) === "not-ok");
  const unchecked = photos.filter((p) => facebookState(status.get(p.id)) === "unchecked");
  const yes = scouts.filter((s) => s.social_ok).length;
  const unanswered = scouts.filter((s) => !s.answered).length;

  return (
    <>
      <BackLink href="/photos" label="Pack photos" />
      <EventTabs
        label="Facebook photos"
        backLabel="Facebook photos"
        lead={
          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Facebook photos</h1>
            <p className="text-sm text-muted">
              A scout&apos;s face can go on the pack&apos;s public Facebook page only if their family said yes; no answer means no. Open a
              photo, mark every scout whose face shows, and the app says whether it&apos;s OK. Save it from the photo to post it.
            </p>
            <p className="text-sm font-semibold text-ink">
              {yes} of {scouts.length} scouts have a yes{unanswered ? ` · ${unanswered} families haven't answered yet` : ""}.
            </p>
          </div>
        }
        tabs={[
          {
            id: "ready",
            label: "OK to post",
            hint: `${ready.length} photo${ready.length === 1 ? "" : "s"}: every face has a yes`,
            icon: <CircleCheck aria-hidden />,
            content: <Grid photos={ready} status={status} empty="No photos are marked OK yet. Check some under To check." />,
          },
          {
            id: "check",
            label: "To check",
            hint: `${unchecked.length} photo${unchecked.length === 1 ? "" : "s"}: mark who's in them`,
            icon: <CircleHelp aria-hidden />,
            content: <Grid photos={unchecked} status={status} empty="Every photo in the album has been checked." />,
          },
          {
            id: "not-ok",
            label: "Not OK",
            hint: `${notOk.length} photo${notOk.length === 1 ? "" : "s"}: a face without a yes`,
            icon: <CircleAlert aria-hidden />,
            content: <Grid photos={notOk} status={status} empty="None." />,
          },
          {
            id: "yes",
            label: "Who said yes",
            hint: `${yes} scout${yes === 1 ? "" : "s"}, by den`,
            icon: <Users aria-hidden />,
            content: (
              <div className="space-y-3">
                {byDen(scouts).map((g) => {
                  const ok = g.scouts.filter((s) => s.social_ok);
                  const no = g.scouts.filter((s) => !s.social_ok);
                  return (
                    <section key={g.den} className="card space-y-1.5">
                      <h2 className="section-title">{g.den}</h2>
                      <p className="text-sm text-ink">
                        <span className="font-bold text-pine">Yes:</span> {ok.length ? ok.map((s) => s.name).join(", ") : "nobody yet"}
                      </p>
                      {no.length > 0 && (
                        <p className="text-sm text-muted">
                          <span className="font-bold text-danger">No or no answer:</span> {no.map((s) => s.name).join(", ")}
                        </p>
                      )}
                    </section>
                  );
                })}
                <p className="text-xs text-muted">
                  Families answer under Me → Family and registration → Photos, and can change it any time. If a family changes a yes to a
                  no, the pack&apos;s Facebook helpers get an alert to check what&apos;s posted.
                </p>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}

function Grid({ photos, status, empty }: { photos: Photo[]; status: Map<string, PhotoSocialStatus>; empty: string }) {
  if (!photos.length) return <p className="card text-sm text-muted">{empty}</p>;
  return (
    <ul className="page-wide grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
      {photos.map((p) => {
        const s = status.get(p.id);
        return (
          <li key={p.id} className="space-y-0.5">
            <Link href={`/photos/${p.id}#facebook`} className="block aspect-square overflow-hidden rounded-lg bg-surface">
              {p.thumb_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.thumb_url} alt={p.caption ?? ""} loading="lazy" className="h-full w-full object-cover" />
              )}
            </Link>
            {s && s.not_ok > 0 && <p className="truncate text-[11px] text-danger">No yes: {s.not_ok_names}</p>}
            {!s?.checked && p.event && <p className="truncate text-[11px] text-muted">{p.event.title}</p>}
          </li>
        );
      })}
    </ul>
  );
}
