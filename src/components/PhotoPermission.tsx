import { Camera, CameraOff } from "lucide-react";
import SubmitButton from "@/components/SubmitButton";
import { setPhotoPermission } from "@/app/(app)/actions";
import type { Scout } from "@/lib/types";

/** "May this scout appear in pack photos?" with Yes / No buttons for each of the family's scouts. */
export default function PhotoPermission({ scouts }: { scouts: Scout[] }) {
  return (
    <ul className="space-y-3">
      {scouts.map((s) => (
        <li key={s.id} className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            {s.photo_permission === "no" ? (
              <CameraOff className="h-4 w-4 text-danger" aria-hidden />
            ) : (
              <Camera className={`h-4 w-4 ${s.photo_permission === "yes" ? "text-pine" : "text-muted"}`} aria-hidden />
            )}
            {s.first_name}:{" "}
            <span className="font-normal text-muted">
              {s.photo_permission === "yes" ? "OK in pack photos" : s.photo_permission === "no" ? "No photos" : "Not answered yet"}
            </span>
          </p>
          <form action={setPhotoPermission} className="grid grid-cols-2 gap-2">
            <input type="hidden" name="scout_id" value={s.id} />
            <SubmitButton
              name="answer"
              value="yes"
              className={`rounded-xl border-[1.5px] px-3 py-2 text-sm font-bold ${
                s.photo_permission === "yes" ? "border-pine bg-brand text-white" : "border-line bg-card text-pine"
              }`}
            >
              Photos OK
            </SubmitButton>
            <SubmitButton
              name="answer"
              value="no"
              className={`rounded-xl border-[1.5px] px-3 py-2 text-sm font-bold ${
                s.photo_permission === "no" ? "border-danger bg-alarm text-white" : "border-line bg-card text-danger"
              }`}
            >
              No photos
            </SubmitButton>
          </form>
        </li>
      ))}
    </ul>
  );
}
