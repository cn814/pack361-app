// Plant ID with Pl@ntNet (my-api.plantnet.org): building the request and reading the answer.
// Pure, so it can be tested on its own. The key stays on the server (PLANTNET_API_KEY).

export const ORGANS = ["auto", "leaf", "flower", "fruit", "bark"] as const;
export type Organ = (typeof ORGANS)[number];

export interface PlantMatch {
  /** "Eastern poison ivy" (falls back to the scientific name). */
  name: string;
  scientific: string;
  family: string | null;
  /** 0–100. */
  percent: number;
  /** A reference photo of the species from Pl@ntNet, with its credit. */
  photo: string | null;
  credit: string | null;
  /** More about it (GBIF species page), when Pl@ntNet links one. */
  url: string | null;
}

export function identifyUrl(key: string): string {
  const q = new URLSearchParams({ "api-key": key, lang: "en", "nb-results": "5", "include-related-images": "true" });
  return `https://my-api.plantnet.org/v2/identify/all?${q}`;
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Only Pl@ntNet's own image host. */
function photoUrl(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && /(^|\.)plantnet\.org$/.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The identify answer → up to three matches worth showing (at least 3% likely). */
export function parsePlantResults(json: unknown): PlantMatch[] {
  const results = obj(json)?.results;
  if (!Array.isArray(results)) return [];
  const out: PlantMatch[] = [];
  for (const r of results) {
    const row = obj(r);
    const sp = obj(row?.species);
    const scientific = str(sp?.scientificNameWithoutAuthor);
    const score = typeof row?.score === "number" ? row.score : null;
    if (!scientific || score === null || score < 0.03) continue;
    const commons = Array.isArray(sp?.commonNames) ? (sp.commonNames as unknown[]).map(str).filter(Boolean) : [];
    const common = (commons[0] as string | undefined) ?? null;
    const images = Array.isArray(row?.images) ? (row.images as unknown[]) : [];
    const img = obj(images[0]);
    const imgUrl = obj(img?.url);
    const gbif = obj(row?.gbif)?.id;
    out.push({
      name: common ? common.replace(/^./, (c) => c.toUpperCase()) : scientific,
      scientific,
      family: str(obj(sp?.family)?.scientificNameWithoutAuthor),
      percent: Math.round(score * 100),
      photo: photoUrl(imgUrl?.m) ?? photoUrl(imgUrl?.s),
      credit: str(img?.citation),
      url: typeof gbif === "string" || typeof gbif === "number" ? `https://www.gbif.org/species/${encodeURIComponent(String(gbif))}` : null,
    });
    if (out.length >= 3) break;
  }
  return out;
}
