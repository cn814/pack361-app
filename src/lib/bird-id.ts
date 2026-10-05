// Bird sound ID (BirdNET, run on the phone): turning the model's scores into what to show.
// Pure, so it can be tested on its own.

export interface Detection {
  index: number;
  scientificName: string;
  commonName: string;
  /** 0–1: how sure the model is about this window of sound. */
  confidence: number;
  /** 0–1: how likely the species is here this week (BirdNET's location model). */
  geoscore: number;
}

export interface Heard {
  index: number;
  name: string;
  scientific: string;
  /** Best confidence so far, 0–100. */
  best: number;
  /** When it was first heard (ms since epoch). */
  first: number;
  /** Seconds of sound it was heard in. */
  times: number;
}

/** BirdNET's non-species labels (Dog, Engine, Human vocal, Siren…) have the same name twice. */
export function isSpecies(d: Pick<Detection, "scientificName" | "commonName">): boolean {
  return d.scientificName !== d.commonName;
}

/** How many recent predictions to smooth over (about two and a half seconds of listening). */
export const POOL = 5;
/** Shown under "Hearing now" at or above this (smoothed) confidence. */
export const NOW_MIN = 0.25;
/** Added to "Heard" at or above this. */
export const HEARD_MIN = 0.45;
/** Species unlikely here this week (below this) are left out. */
export const GEO_MIN = 0.03;

/**
 * Smooth the last few predictions: the average of their logits, counting a species missing from a
 * prediction as nearly zero. Stricter than BirdNET Live's log-mean-exp (which follows the loudest
 * moment), so one blip or a scout's whistle doesn't show up as a bird; a bird that keeps singing does.
 */
export function pool(sets: Detection[][]): Detection[] {
  if (!sets.length) return [];
  const eps = 1e-4;
  const byIndex = new Map<number, { ref: Detection; logits: number[] }>();
  sets.forEach((set, s) => {
    for (const d of set) {
      const e = byIndex.get(d.index) ?? { ref: d, logits: Array(sets.length).fill(Math.log(0.01 / 0.99)) };
      const c = Math.min(1 - eps, Math.max(eps, d.confidence));
      e.logits[s] = Math.log(c / (1 - c));
      e.ref = d;
      byIndex.set(d.index, e);
    }
  });
  const out: Detection[] = [];
  for (const { ref, logits } of byIndex.values()) {
    const mean = logits.reduce((a, l) => a + l, 0) / logits.length;
    out.push({ ...ref, confidence: 1 / (1 + Math.exp(-mean)) });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

/** The birds to show under "Hearing now": real species, likely here, confident enough. Top 3. */
export function hearingNow(pooled: Detection[]): Detection[] {
  return pooled.filter((d) => isSpecies(d) && d.geoscore >= GEO_MIN && d.confidence >= NOW_MIN).slice(0, 3);
}

/** Add this moment's confident birds to the session's list (newest first heard last). */
export function addHeard(list: Heard[], now: Detection[], at: number): Heard[] {
  const next = list.map((h) => ({ ...h }));
  for (const d of now) {
    if (d.confidence < HEARD_MIN) continue;
    const h = next.find((x) => x.index === d.index);
    const pct = Math.round(d.confidence * 100);
    if (h) {
      h.best = Math.max(h.best, pct);
      h.times += 1;
    } else {
      next.push({ index: d.index, name: d.commonName, scientific: d.scientificName, best: pct, first: at, times: 1 });
    }
  }
  return next;
}

/** The week of the year, worked out the same way BirdNET Live does, for the location model. */
export function birdnetWeek(d = new Date()): number {
  const start = new Date(d.getFullYear(), 0, 1);
  start.setDate(start.getDate() + (1 - (start.getDay() % 7)));
  return Math.round((d.getTime() - start.getTime()) / 604800000) + 1;
}
