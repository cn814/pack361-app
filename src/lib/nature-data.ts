import "server-only";
import { eventPoint } from "./weather";
import { NWS_USER_AGENT, type WeatherEvent } from "./weather-nws";
import { eventMonths, parseSpeciesCounts, speciesUrl, type Species } from "./nature";

// What lives near an event, from iNaturalist (free, no key). Asked at most once a day per spot
// and month (Next's fetch cache), with a short timeout: the Trail guide never holds up a page.

const TIMEOUT_MS = 5000;
const DAY = 86400;

async function getSpecies(url: string): Promise<Species[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": NWS_USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: DAY },
    });
    if (!res.ok) return [];
    return parseSpeciesCounts(await res.json());
  } catch {
    return [];
  }
}

/** Where to listen for birds when there's no event address: Ellicott City. */
export const PACK_HOME = { lat: 39.27, lon: -76.83 };

/** Plant ID is set up (the pack's Pl@ntNet key is in place). */
export const plantIdReady = () => Boolean(process.env.PLANTNET_API_KEY);

export interface TrailGuide {
  /** Where the event is (or the pack's home area): bird sound ID leaves out birds unlikely there. */
  point: { lat: number; lon: number };
  birds: Species[];
  plants: Species[];
  /** Month names the lists cover ("October", "October and November"). */
  months: string;
}

const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Birds and plants recorded within 5 km of the event in its month(s). Empty lists if unknown. */
export async function loadTrailGuide(e: WeatherEvent): Promise<TrailGuide> {
  const months = eventMonths(e);
  const label = months.map((m) => MONTH[m - 1]).join(" and ");
  const point = await eventPoint(e);
  if (!point) return { point: PACK_HOME, birds: [], plants: [], months: label };
  const [birds, plants] = await Promise.all([getSpecies(speciesUrl(point, "Aves", months)), getSpecies(speciesUrl(point, "Plantae", months))]);
  return { point, birds, plants, months: label };
}
