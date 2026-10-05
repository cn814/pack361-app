import { Bird, ChevronDown, Leaf } from "lucide-react";
import BirdSoundId from "@/components/BirdSoundId";
import PlantId from "@/components/PlantId";

const MERLIN = "https://merlin.allaboutbirds.org/download/";
const SEEK = "https://www.inaturalist.org/pages/seek_app";

/**
 * The two ID tools, each in a fold-out so the page stays short: listen for birds (BirdNET, on the
 * phone) and identify a plant from a photo (Pl@ntNet). `point` = where, for leaving out birds
 * unlikely there.
 */
export default function NatureTools({ point, plantReady }: { point: { lat: number; lon: number }; plantReady: boolean }) {
  return (
    <div className="space-y-2">
      <details className="group rounded-xl ring-1 ring-line">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 font-bold text-pine-950">
          <Bird className="h-4 w-4 text-pine" aria-hidden /> <span className="flex-1">Listen for birds</span>
          <ChevronDown className="h-4 w-4 text-muted transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="px-3 pb-3">
          <BirdSoundId lat={point.lat} lon={point.lon} />
        </div>
      </details>
      <details className="group rounded-xl ring-1 ring-line">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 font-bold text-pine-950">
          <Leaf className="h-4 w-4 text-pine" aria-hidden /> <span className="flex-1">Identify a plant</span>
          <ChevronDown className="h-4 w-4 text-muted transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="px-3 pb-3">
          {plantReady ? (
            <PlantId />
          ) : (
            <p className="text-sm text-muted">
              Plant ID is being set up. Until then, the free{" "}
              <a href={SEEK} target="_blank" rel="noopener noreferrer" className="font-bold text-pine underline">
                Seek app
              </a>{" "}
              identifies plants from a photo.
            </p>
          )}
        </div>
      </details>
      <p className="text-[11px] text-muted">
        Prefer an app? The free{" "}
        <a href={MERLIN} target="_blank" rel="noopener noreferrer" className="font-bold text-pine underline">
          Merlin
        </a>{" "}
        (birds by sound or photo) and{" "}
        <a href={SEEK} target="_blank" rel="noopener noreferrer" className="font-bold text-pine underline">
          Seek
        </a>{" "}
        (plants, bugs and more) apps do this too.
      </p>
    </div>
  );
}
