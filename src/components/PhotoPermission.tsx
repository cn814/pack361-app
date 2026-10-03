import { Camera, CameraOff } from "lucide-react";
import SubmitButton from "@/components/SubmitButton";
import { setPhotoPermission } from "@/app/(app)/actions";
import { photosOk } from "@/lib/photo-permission";
import type { Scout } from "@/lib/types";

/** "Photos: OK to include <Scout> in pack photos", on unless the family opted out, with Opt out / Allow photos. */
export default function PhotoPermission({ scouts }: { scouts: Scout[] }) {
  return (
    <ul className="divide-y divide-line">
      {scouts.map((s) => {
        const ok = photosOk(s.photo_permission);
        return (
          <li key={s.id} className="flex items-center gap-3 py-2.5">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${ok ? "bg-mint text-pine" : "bg-danger-50 text-danger"}`}
              aria-hidden
            >
              {ok ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="block text-xs font-bold text-muted">Photos: {ok ? "on" : "off"}</span>
              <span className="block font-semibold text-ink">
                {ok ? `OK to include ${s.first_name} in pack photos` : `${s.first_name} is opted out of pack photos`}
              </span>
              {!ok && <span className="block text-xs text-muted">Leaders won&apos;t approve photos showing {s.first_name}.</span>}
            </span>
            <form action={setPhotoPermission} className="shrink-0">
              <input type="hidden" name="scout_id" value={s.id} />
              {ok ? (
                <SubmitButton
                  name="answer"
                  value="no"
                  className="min-h-10 rounded-xl border-[1.5px] border-danger bg-card px-3 py-2 text-sm font-bold text-danger"
                >
                  Opt out
                </SubmitButton>
              ) : (
                <SubmitButton
                  name="answer"
                  value="yes"
                  className="min-h-10 rounded-xl border-[1.5px] border-pine bg-card px-3 py-2 text-sm font-bold text-pine"
                >
                  Allow photos
                </SubmitButton>
              )}
            </form>
          </li>
        );
      })}
    </ul>
  );
}
