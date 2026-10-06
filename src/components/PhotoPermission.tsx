import { Camera, CameraOff, Globe, GlobeLock } from "lucide-react";
import SubmitButton from "@/components/SubmitButton";
import { setFacebookOk, setPhotoPermission } from "@/app/(app)/actions";
import { facebookOk, photosOk } from "@/lib/photo-permission";
import type { Scout } from "@/lib/types";

const OFF = "min-h-10 rounded-xl border-[1.5px] border-danger bg-card px-3 py-2 text-sm font-bold text-danger";
const ON = "min-h-10 rounded-xl border-[1.5px] border-pine bg-card px-3 py-2 text-sm font-bold text-pine";

/**
 * For each scout:
 *  - Pack photos (the private album): on unless the family opted out, with Opt out / Allow photos.
 *  - The pack's public Facebook page: off unless the family says yes, with Yes / No.
 */
export default function PhotoPermission({ scouts }: { scouts: Scout[] }) {
  return (
    <ul className="divide-y divide-line">
      {scouts.map((s) => {
        const ok = photosOk(s.photo_permission);
        const fb = facebookOk(s);
        const unanswered = ok && s.social_ok == null;
        return (
          <li key={s.id} className="space-y-2 py-3">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${ok ? "bg-mint text-pine" : "bg-danger-50 text-danger"}`}
                aria-hidden
              >
                {ok ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="block text-xs font-bold text-muted">Pack album: {ok ? "on" : "off"}</span>
                <span className="block font-semibold text-ink">
                  {ok ? `OK to include ${s.first_name} in pack photos` : `${s.first_name} is opted out of pack photos`}
                </span>
                {!ok && <span className="block text-xs text-muted">Leaders won&apos;t approve new photos showing {s.first_name}, and we&apos;ll check photos already in the album.</span>}
              </span>
              <form action={setPhotoPermission} className="shrink-0">
                <input type="hidden" name="scout_id" value={s.id} />
                {ok ? (
                  <SubmitButton name="answer" value="no" className={OFF}>
                    Opt out
                  </SubmitButton>
                ) : (
                  <SubmitButton name="answer" value="yes" className={ON}>
                    Allow photos
                  </SubmitButton>
                )}
              </form>
            </div>
            {ok && (
              <div id={`facebook-${s.id}`} className="flex items-center gap-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${fb ? "bg-mint text-pine" : unanswered ? "bg-gold-50 text-gold-800" : "bg-surface text-muted"}`}
                  aria-hidden
                >
                  {fb ? <Globe className="h-4 w-4" /> : <GlobeLock className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block text-xs font-bold text-muted">Pack Facebook page: {fb ? "yes" : unanswered ? "not answered yet" : "no"}</span>
                  <span className="block font-semibold text-ink">
                    {fb ? `OK to show ${s.first_name}'s face on the pack's public Facebook page` : `${s.first_name}'s face won't show on the pack's public Facebook page`}
                  </span>
                  {unanswered && <span className="block text-xs text-muted">Until you say yes, the pack covers {s.first_name}&apos;s face or leaves the photo off.</span>}
                </span>
                <form action={setFacebookOk} className="flex shrink-0 gap-1.5">
                  <input type="hidden" name="scout_id" value={s.id} />
                  {s.social_ok !== true && (
                    <SubmitButton name="answer" value="yes" className={ON}>
                      Yes
                    </SubmitButton>
                  )}
                  {s.social_ok !== false && (
                    <SubmitButton name="answer" value="no" className={unanswered ? ON : OFF}>
                      No
                    </SubmitButton>
                  )}
                </form>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
