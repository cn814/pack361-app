// The Trail guide on campouts and hikes: which events get it, and reading iNaturalist's answer
// (the birds and plants people have recorded near a spot). Pure, so it can be tested on its own.

import { easternDate } from "./tz";

/** Words that mean an event involves hiking or time on a trail. */
const HIKING = /\b(hik(e|es|ed|ing)|trails?|nature walks?|nature hikes?|scavenger hunts?|orienteering|bird ?walks?|geocach\w*)\b/i;

/** How far ahead of an event the Trail guide appears. */
export const NATURE_DAYS_BEFORE = 30;

export interface NatureEvent {
  title: string;
  category: string;
  details?: string | null;
  starts_at: string;
  ends_at: string | null;
  location_name: string | null;
  address: string | null;
  leaders_only?: boolean;
}

/**
 * Campouts always; any other event whose name, details, page sections or schedule mention a hike
 * or a trail. Needs a place (for what lives nearby) and isn't for leaders-only meetings.
 */
export function involvesHiking(e: NatureEvent, extraText: string[] = []): boolean {
  if (e.leaders_only) return false;
  if (!(e.location_name?.trim() || e.address?.trim())) return false;
  if (e.category === "Campout") return true;
  return [e.title, e.details ?? "", ...extraText].some((t) => HIKING.test(t));
}

/** Show it from a month before the event until it ends (or the end of its day). */
export function showNature(e: Pick<NatureEvent, "starts_at" | "ends_at">, now = Date.now()): boolean {
  const start = Date.parse(e.starts_at);
  const end = e.ends_at ? Date.parse(e.ends_at) : start + 12 * 3600000;
  return now >= start - NATURE_DAYS_BEFORE * 86400000 && now < Math.max(end, start + 3600000);
}

/** The months (1–12, Eastern time) the event covers: what's around then. */
export function eventMonths(e: Pick<NatureEvent, "starts_at" | "ends_at">): number[] {
  const first = Number(easternDate(e.starts_at).slice(5, 7));
  const last = Number(easternDate(e.ends_at ?? e.starts_at).slice(5, 7));
  return first === last ? [first] : [first, last];
}

export interface Species {
  id: number;
  /** "Northern Cardinal" (falls back to the scientific name). */
  name: string;
  scientific: string;
  /** How many times it has been recorded there. */
  count: number;
  photo: string | null;
  /** "(c) Jane Doe, some rights reserved (CC BY-NC)". */
  credit: string | null;
  /** The species page on iNaturalist. */
  url: string;
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Only photos from iNaturalist's own image hosts. */
function photoUrl(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    const ok = u.protocol === "https:" && (u.hostname === "static.inaturalist.org" || u.hostname === "inaturalist-open-data.s3.amazonaws.com");
    return ok ? u.toString() : null;
  } catch {
    return null;
  }
}

/** /v1/observations/species_counts → the species, most recorded first. Bad entries are skipped. */
export function parseSpeciesCounts(json: unknown, max = 8): Species[] {
  const results = obj(json)?.results;
  if (!Array.isArray(results)) return [];
  const out: Species[] = [];
  for (const r of results) {
    const row = obj(r);
    const t = obj(row?.taxon);
    const id = typeof t?.id === "number" ? t.id : null;
    const scientific = str(t?.name);
    if (!id || !scientific) continue;
    const photo = obj(t?.default_photo);
    const common = str(t?.preferred_common_name);
    out.push({
      id,
      name: common ? common.replace(/^./, (c) => c.toUpperCase()) : scientific,
      scientific,
      count: typeof row?.count === "number" ? row.count : 0,
      photo: photoUrl(photo?.square_url) ?? photoUrl(photo?.url),
      credit: str(photo?.attribution),
      url: `https://www.inaturalist.org/taxa/${id}`,
    });
    if (out.length >= max) break;
  }
  return out;
}

/** The species_counts query for one group near a spot. */
export function speciesUrl(p: { lat: number; lon: number }, group: "Aves" | "Plantae", months: number[]): string {
  const q = new URLSearchParams({
    lat: p.lat.toFixed(4),
    lng: p.lon.toFixed(4),
    radius: "5",
    iconic_taxa: group,
    quality_grade: "research",
    month: months.join(","),
    rank: "species",
    per_page: "12",
    locale: "en",
  });
  return `https://api.inaturalist.org/v1/observations/species_counts?${q}`;
}

export interface TaxonPhoto {
  photo: string | null;
  credit: string | null;
  /** The species page on iNaturalist. */
  url: string | null;
}

/** The iNaturalist species search for a scientific name (for a bird heard by sound ID). */
export function taxonUrl(scientific: string): string {
  const q = new URLSearchParams({ q: scientific, rank: "species", per_page: "5", locale: "en" });
  return `https://api.inaturalist.org/v1/taxa?${q}`;
}

/** /v1/taxa → the photo of the species whose scientific name matches exactly. */
export function parseTaxonPhoto(json: unknown, scientific: string): TaxonPhoto {
  const results = obj(json)?.results;
  const want = scientific.trim().toLowerCase();
  if (Array.isArray(results)) {
    for (const r of results) {
      const t = obj(r);
      if (str(t?.name)?.toLowerCase() !== want || typeof t?.id !== "number") continue;
      const p = obj(t.default_photo);
      return { photo: photoUrl(p?.medium_url) ?? photoUrl(p?.square_url), credit: str(p?.attribution), url: `https://www.inaturalist.org/taxa/${t.id}` };
    }
  }
  return { photo: null, credit: null, url: null };
}
