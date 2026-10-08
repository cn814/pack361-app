import { Suspense } from "react";
import { ExternalLink, Leaf } from "lucide-react";
import NatureTools from "@/components/NatureTools";
import ScavengerHunt from "@/components/ScavengerHunt";
import { involvesHiking, scavengerHunt, showNature, type Species } from "@/lib/nature";
import { loadTrailGuide, plantIdReady } from "@/lib/nature-data";
import type { PackEvent } from "@/lib/types";

/**
 * Trail guide on campouts and events with a hike: bird sound ID and plant ID right in the app, and
 * the birds and plants people have recorded near the event in that month (from iNaturalist), and in
 * the fall a scavenger hunt. From a month before the event until it ends. `extraText` = the page's
 * sections and schedule, which can mention a hike when the event's name doesn't.
 */
export default function EventTrailGuide({ e, extraText = [] }: { e: PackEvent; extraText?: string[] }) {
  if (e.archived_at || !involvesHiking(e, extraText) || !showNature(e)) return null;
  return (
    <Suspense fallback={null}>
      <Loaded e={e} />
    </Suspense>
  );
}

async function Loaded({ e }: { e: PackEvent }) {
  const g = await loadTrailGuide(e);
  const credits = [...g.birds, ...g.plants].filter((s) => s.photo && s.credit);
  const hunt = scavengerHunt(e);
  return (
    <section id="trail-guide" className="card scroll-mt-20 space-y-3">
      <h2 className="section-title flex items-center gap-1.5">
        <Leaf className="h-4 w-4" aria-hidden /> Trail guide
      </h2>
      <p className="text-sm text-ink">Hear a bird or spot a plant on the trail? Find out what it is, right here.</p>
      <NatureTools point={g.point} plantReady={plantIdReady()} />
      {hunt && <ScavengerHunt eventId={e.id} title={hunt.title} items={hunt.items} />}

      {g.birds.length > 0 && <Strip title={`Birds seen near here in ${g.months}`} list={g.birds} />}
      {g.plants.length > 0 && <Strip title={`Plants seen near here in ${g.months}`} list={g.plants} />}

      {(g.birds.length > 0 || g.plants.length > 0) && (
        <details className="text-[11px] text-muted">
          <summary className="cursor-pointer font-bold">From iNaturalist · photo credits</summary>
          <p className="pt-1">
            Species recorded within about 3 miles by{" "}
            <a href="https://www.inaturalist.org" target="_blank" rel="noopener noreferrer" className="font-bold text-pine underline">
              iNaturalist
            </a>{" "}
            observers. Photos:
          </p>
          <ul className="list-disc pl-4">
            {credits.map((s) => (
              <li key={s.id}>
                {s.name}: {s.credit}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Strip({ title, list }: { title: string; list: Species[] }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-extrabold uppercase tracking-[0.1em] text-muted">{title}</h3>
      <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {list.map((s) => (
          <li key={s.id} className="w-24 shrink-0 snap-start">
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="block space-y-1" title={s.scientific}>
              {s.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.photo} alt={s.name} loading="lazy" className="aspect-square w-24 rounded-xl bg-surface-low object-cover" />
              ) : (
                <span className="flex aspect-square w-24 items-center justify-center rounded-xl bg-surface-low text-muted">
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </span>
              )}
              <span className="line-clamp-2 block text-xs font-bold leading-tight text-ink">{s.name}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
