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

export interface TrailGuide {
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
  if (!point) return { birds: [], plants: [], months: label };
  const [birds, plants] = await Promise.all([getSpecies(speciesUrl(point, "Aves", months)), getSpecies(speciesUrl(point, "Plantae", months))]);
  return { birds, plants, months: label };
}
