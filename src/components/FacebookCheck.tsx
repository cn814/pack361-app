import { CircleAlert, CircleCheck, CircleHelp, Users } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import { savePhotoPeople } from "@/app/(app)/photos/actions";
import { byDen, type SocialScout } from "@/lib/facebook";
import { facebookState, type PhotoSocialStatus } from "@/lib/photo-permission";

/**
 * On a photo, for leaders and the pack's Facebook helpers: can it go on the pack's public
 * Facebook page? Mark every scout whose face shows; it's OK when each of them has a yes.
 */
export default function FacebookCheck({
  photoId,
  status,
  scouts,
  inPhoto,
}: {
  photoId: string;
  status: PhotoSocialStatus | undefined;
  scouts: SocialScout[];
  inPhoto: string[];
}) {
  const state = facebookState(status);
  const tagged = new Set(inPhoto);
  const names = scouts.filter((s) => tagged.has(s.scout_id)).map((s) => s.name);
  const head =
    state === "ok"
      ? {
          icon: <CircleCheck className="h-5 w-5 text-pine" aria-hidden />,
          title: "OK for the pack's Facebook page",
          text: status?.people ? `Every scout marked in it has a yes: ${names.join(", ")}.` : "Marked as no scout's face showing.",
          box: "border-l-pine",
        }
      : state === "not-ok"
        ? {
            icon: <CircleAlert className="h-5 w-5 text-danger" aria-hidden />,
            title: "Not OK for Facebook as it is",
            text: `No yes from the family of ${status?.not_ok_names ?? "a scout in it"}. Cover ${status && status.not_ok > 1 ? "their faces" : "that face"}, crop it out, or pick another photo.`,
            box: "border-l-danger",
          }
        : {
            icon: <CircleHelp className="h-5 w-5 text-gold-700" aria-hidden />,
            title: "Not checked for Facebook yet",
            text: "Mark every scout whose face shows. It's OK for Facebook when each of them has a yes.",
            box: "border-l-gold",
          };

  return (
    <section id="facebook" className={`card scroll-mt-20 space-y-3 border-l-4 ${head.box}`}>
      <div className="flex gap-3">
        <span className="pt-0.5">{head.icon}</span>
        <div className="min-w-0">
          <h2 className="font-extrabold text-pine-950">{head.title}</h2>
          <p className="text-sm text-muted">{head.text}</p>
        </div>
      </div>
      <details open={state === "unchecked"} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-pine">
          <Users className="h-4 w-4" aria-hidden /> {state === "unchecked" ? "Who's in this photo?" : "Change who's in this photo"}
        </summary>
        <div className="pt-3">
          <ActionForm action={savePhotoPeople} resetOnSuccess={false} submit="Save" buttonClass="btn-primary w-full py-2">
            <input type="hidden" name="id" value={photoId} />
            <p className="text-xs text-muted">
              Tick every scout whose face you can make out, even in the background. <span className="font-bold text-pine">Yes</span> = their
              family said OK for Facebook.
            </p>
            {byDen(scouts).map((g) => (
              <fieldset key={g.den} className="space-y-1.5">
                <legend className="text-xs font-bold uppercase tracking-wide text-muted">{g.den}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {g.scouts.map((s) => (
                    <label
                      key={s.scout_id}
                      className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-card px-2.5 py-1.5 text-sm has-[:checked]:border-pine has-[:checked]:bg-mint"
                    >
                      <input type="checkbox" name="scout" value={s.scout_id} defaultChecked={tagged.has(s.scout_id)} className="h-4 w-4 accent-pine" />
                      <span className="font-semibold text-ink">{s.name}</span>
                      <span className={`text-[11px] font-bold ${s.social_ok ? "text-pine" : "text-danger"}`}>{s.social_ok ? "Yes" : s.answered ? "No" : "No answer"}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-sm has-[:checked]:border-pine has-[:checked]:bg-mint">
              <input type="checkbox" name="none" defaultChecked={!!status?.checked && status.people === 0} className="h-4 w-4 accent-pine" />
              <span className="font-semibold text-ink">No scout&apos;s face shows (backs of heads, hands, scenery)</span>
            </label>
          </ActionForm>
        </div>
      </details>
    </section>
  );
}
