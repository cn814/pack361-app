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

/** How many recent predictions to smooth over (about four seconds of listening). */
export const POOL = 8;
/** Shown under "Hearing now" at or above this (smoothed) confidence. */
export const NOW_MIN = 0.25;
/** Added to "Heard" at or above this. */
export const HEARD_MIN = 0.35;
/** Species unlikely here this week (below this) are left out. */
export const GEO_MIN = 0.03;

/** A species counts as heard in a prediction from this confidence up. */
export const HIT_MIN = 0.1;

/**
 * Smooth the last few predictions. Birds sing in bursts with gaps, so a species doesn't have to be
 * in every prediction: it needs to show up in at least two of them (so one blip, or a scout's
 * single whistle, doesn't count as a bird), and its score is the average of its two best. A bird
 * heard only once is kept but scored down, below every threshold.
 */
export function pool(sets: Detection[][]): Detection[] {
  if (!sets.length) return [];
  const byIndex = new Map<number, { ref: Detection; scores: number[] }>();
  for (const set of sets) {
    for (const d of set) {
      const e = byIndex.get(d.index) ?? { ref: d, scores: [] };
      e.scores.push(d.confidence);
      e.ref = d;
      byIndex.set(d.index, e);
    }
  }
  const out: Detection[] = [];
  for (const { ref, scores } of byIndex.values()) {
    const hits = scores.filter((c) => c >= HIT_MIN).sort((x, y) => y - x);
    const confidence = hits.length >= 2 ? (hits[0] + hits[1]) / 2 : (hits[0] ?? 0) / 5;
    out.push({ ...ref, confidence });
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
