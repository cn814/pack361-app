// The National Weather Service forecast and alerts (api.weather.gov) and the Census geocoder:
// reading their answers, and working out which forecast periods and alerts matter for an event.
// Pure (no fetching, no database): used by lib/weather (server) and safe to test on its own.
import { TZ, addDays, easternDate, startOfEasternDay } from "./tz";

/** api.weather.gov asks every app to name itself and give a contact. */
export const NWS_USER_AGENT = "Pack361App (info@pack361.org)";
export const NWS_API = "https://api.weather.gov";
export const CENSUS_GEOCODER = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

/** The forecast shows on an event page from this many days before it starts until it ends. */
export const SHOW_DAYS_BEFORE = 7;
/** The daily job looks for weather alerts at events starting within this many days. */
export const ALERT_DAYS_AHEAD = 3;
/** An event with no end time is taken to last this long. */
const DEFAULT_HOURS = 2;

export interface WeatherPoint {
  lat: number;
  lon: number;
}

/** What the Weather Service's /points lookup gives: where to get the forecast for that spot. */
export interface NwsPoint {
  forecastUrl: string;
  hourlyUrl: string | null;
}

export interface ForecastPeriod {
  /** "Saturday", "Saturday Night", "This Afternoon", "Columbus Day"... */
  name: string;
  startTime: string;
  endTime: string;
  isDaytime: boolean;
  temperature: number | null;
  unit: "F" | "C";
  /** Chance of rain (or snow), percent; null when the Weather Service gives none. */
  rain: number | null;
  /** "5 to 10 mph" */
  wind: string | null;
  windDirection: string | null;
  /** "Chance Showers And Thunderstorms" */
  short: string;
}

export interface WeatherAlert {
  /** The alert's id ("urn:oid:..."); a later update of the same alert gets a new one. */
  id: string;
  /** Ids of the earlier versions this one updates. */
  references: string[];
  /** "Severe Thunderstorm Watch" */
  event: string;
  headline: string | null;
  /** Extreme, Severe, Moderate, Minor or Unknown. */
  severity: string;
  urgency: string;
  /**
   * When the weather itself starts and ends. With no end given (a tornado warning, say), the
   * message's own expiry; null only when it has neither (until further notice).
   */
  onset: string | null;
  ends: string | null;
  description: string | null;
  instruction: string | null;
}

/** The fields of an event the weather needs. */
export interface WeatherEvent {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day?: boolean | null;
  location_name: string | null;
  address: string | null;
}

// ---------------------------------------------------------------------------------------------
// Reading the answers

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Only ever follow links back to api.weather.gov (never wherever an answer points). */
function nwsUrl(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && u.hostname === "api.weather.gov" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** /points/{lat},{lon} → where the forecasts for that spot are. */
export function parsePoint(json: unknown): NwsPoint | null {
  const p = obj(obj(json)?.properties);
  const forecastUrl = nwsUrl(p?.forecast);
  if (!forecastUrl) return null;
  return { forecastUrl, hourlyUrl: nwsUrl(p?.forecastHourly) };
}

/** A number, or a { value } (the API can send quantities either way). */
function quantity(v: unknown): number | null {
  return num(v) ?? num(obj(v)?.value);
}

/** The forecast → its periods (day and night halves), in order. Bad periods are skipped. */
export function parseForecast(json: unknown): ForecastPeriod[] {
  const periods = obj(obj(json)?.properties)?.periods;
  if (!Array.isArray(periods)) return [];
  const out: ForecastPeriod[] = [];
  for (const raw of periods) {
    const p = obj(raw);
    const startTime = str(p?.startTime);
    const endTime = str(p?.endTime);
    if (!p || !startTime || !endTime || Number.isNaN(Date.parse(startTime)) || Number.isNaN(Date.parse(endTime))) continue;
    const unitCode = str(obj(p.temperature)?.unitCode) ?? "";
    const unit = str(p.temperatureUnit) === "C" || /degC/.test(unitCode) ? "C" : "F";
    const rain = quantity(p.probabilityOfPrecipitation);
    out.push({
      name: str(p.name) ?? "",
      startTime,
      endTime,
      isDaytime: p.isDaytime === true,
      temperature: quantity(p.temperature),
      unit,
      rain: rain === null ? null : Math.max(0, Math.min(100, Math.round(rain))),
      wind: str(p.windSpeed),
      windDirection: str(p.windDirection),
      short: str(p.shortForecast) ?? "",
    });
  }
  return out.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
}

/**
 * The Weather Service wraps long text at about 70 characters. Keep the paragraph breaks and
 * join the rest so it reads properly on a phone.
 */
export function unwrap(text: string | null): string | null {
  if (!text) return null;
  const paras = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
  return paras.length ? paras.join("\n\n") : null;
}

/** /alerts/active?point=... → the alerts in force there (real ones only; tests and cancels left out). */
export function parseAlerts(json: unknown): WeatherAlert[] {
  const features = obj(json)?.features;
  if (!Array.isArray(features)) return [];
  const out: WeatherAlert[] = [];
  for (const raw of features) {
    const f = obj(raw);
    const p = obj(f?.properties);
    if (!p) continue;
    const status = str(p.status);
    if (status && status !== "Actual") continue; // Test, Exercise, Draft
    if (str(p.messageType) === "Cancel") continue;
    const event = str(p.event);
    const id = str(p.id) ?? str(f?.id);
    if (!event || !id) continue;
    const references = Array.isArray(p.references)
      ? (p.references.map((r) => str(obj(r)?.identifier)).filter(Boolean) as string[])
      : [];
    out.push({
      id,
      references,
      event,
      headline: str(p.headline),
      severity: str(p.severity) ?? "Unknown",
      urgency: str(p.urgency) ?? "Unknown",
      onset: str(p.onset) ?? str(p.effective) ?? str(p.sent),
      ends: str(p.ends) ?? str(p.expires),
      description: unwrap(str(p.description)),
      instruction: unwrap(str(p.instruction)),
    });
  }
  return out.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

const SEVERITY = ["Extreme", "Severe", "Moderate", "Minor", "Unknown"];
function severityRank(s: string): number {
  const i = SEVERITY.indexOf(s);
  return i < 0 ? SEVERITY.length : i;
}

/** The Census geocoder's best match, or null when it found none. */
export function parseCensusMatch(json: unknown): WeatherPoint | null {
  const matches = obj(obj(json)?.result)?.addressMatches;
  if (!Array.isArray(matches) || !matches.length) return null;
  const c = obj(obj(matches[0])?.coordinates);
  const lon = num(c?.x);
  const lat = num(c?.y);
  if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat: round4(lat), lon: round4(lon) };
}

// ---------------------------------------------------------------------------------------------
// Where

/** Four decimal places (about 10 m): what api.weather.gov wants in a /points address. */
export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** The place as one line ("Centennial Park, 10000 Route 108, Ellicott City, MD"): what the coordinates came from. */
export function placeText(e: { location_name: string | null; address: string | null }): string {
  return [e.location_name, e.address]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * What to ask the Census geocoder, best first. It only knows street addresses, so a place name
 * ("Rockburn Park, 5400 Landing Rd...") is dropped, and an address with no state or ZIP gets
 * ", MD" (pack events are in Maryland unless the address says otherwise). At most three.
 */
export function geocodeCandidates(e: { location_name: string | null; address: string | null }): string[] {
  const base: string[] = [];
  const address = e.address?.trim();
  const name = e.location_name?.trim();
  if (address) base.push(address);
  else if (name && /\d/.test(name)) base.push(name); // a street address typed in as the place
  // From the first part that starts with a house number.
  for (const s of [...base]) {
    const m = s.match(/(?:^|,\s*)(\d+[A-Za-z]?\s+[^,\s][^]*)$/);
    if (m && m[1] !== s) base.push(m[1]);
  }
  const out: string[] = [];
  for (const s of base) {
    out.push(s);
    const hasState = /\b\d{5}(?:-\d{4})?\s*$/.test(s) || /,\s*[A-Za-z]{2}\.?\s*$/.test(s) || /\b(maryland|virginia|pennsylvania|delaware|west virginia)\s*$/i.test(s);
    if (!hasState) out.push(`${s}, MD`);
  }
  return [...new Set(out)].filter((s) => s.length >= 5 && s.length <= 300).slice(0, 3);
}

export function pointsUrl(p: WeatherPoint): string {
  return `${NWS_API}/points/${round4(p.lat)},${round4(p.lon)}`;
}

export function alertsUrl(p: WeatherPoint): string {
  return `${NWS_API}/alerts/active?point=${round4(p.lat)},${round4(p.lon)}`;
}

export function censusUrl(address: string): string {
  return `${CENSUS_GEOCODER}?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
}

/** The Weather Service's own forecast page for the spot (forecast.weather.gov). */
export function forecastPageUrl(p: WeatherPoint): string {
  return `https://forecast.weather.gov/MapClick.php?lat=${round4(p.lat)}&lon=${round4(p.lon)}`;
}

// ---------------------------------------------------------------------------------------------
// When

/**
 * When the event runs, as milliseconds. All-day events cover their whole Eastern days; an event
 * with no end time is taken to last two hours.
 */
export function eventWindow(e: { starts_at: string; ends_at: string | null; all_day?: boolean | null }): { start: number; end: number } {
  if (e.all_day) {
    const first = easternDate(e.starts_at);
    const last = easternDate(e.ends_at ?? e.starts_at);
    return { start: Date.parse(startOfEasternDay(first)), end: Date.parse(startOfEasternDay(addDays(last < first ? first : last, 1))) };
  }
  const start = Date.parse(e.starts_at);
  const end = e.ends_at ? Date.parse(e.ends_at) : start + DEFAULT_HOURS * 3600000;
  return { start, end: Math.max(start, end) };
}

/** Show the weather on the event page? From a week before it starts until it ends. */
export function showWeather(e: { starts_at: string; ends_at: string | null; all_day?: boolean | null }, now = Date.now()): boolean {
  const w = eventWindow(e);
  return now >= w.start - SHOW_DAYS_BEFORE * 86400000 && now < w.end;
}

const overlaps = (aStart: number, aEnd: number, w: { start: number; end: number }) => aStart < w.end && aEnd > w.start;

/** The forecast periods that overlap the event (a campout gets every half-day it covers). */
export function periodsForEvent(periods: ForecastPeriod[], e: { starts_at: string; ends_at: string | null; all_day?: boolean | null }): ForecastPeriod[] {
  const w = eventWindow(e);
  return periods.filter((p) => overlaps(Date.parse(p.startTime), Date.parse(p.endTime), w));
}

/**
 * Does the forecast run out before the event ends? (More of it shows up in the coming days.)
 * Six hours' slack, so an all-day event whose evening isn't in the forecast yet doesn't count.
 */
export function forecastEndsEarly(periods: ForecastPeriod[], e: { starts_at: string; ends_at: string | null; all_day?: boolean | null }): boolean {
  if (!periods.length) return false;
  return Date.parse(periods[periods.length - 1].endTime) < eventWindow(e).end - 6 * 3600000;
}

/** Alerts whose weather overlaps the event. An alert with no end or expiry lasts until further notice. */
export function alertsForEvent(alerts: WeatherAlert[], e: { starts_at: string; ends_at: string | null; all_day?: boolean | null }): WeatherAlert[] {
  const w = eventWindow(e);
  return alerts.filter((a) => {
    const from = a.onset ? Date.parse(a.onset) : -Infinity;
    const to = a.ends ? Date.parse(a.ends) : Infinity;
    return overlaps(Number.isNaN(from) ? -Infinity : from, Number.isNaN(to) ? Infinity : to, w);
  });
}

// ---------------------------------------------------------------------------------------------
// Which alerts leaders hear about

/** Advisories worth a leader's attention (every watch and warning is, too). */
const PUSH_ADVISORIES = [
  "Heat Advisory",
  "Wind Advisory",
  "Winter Weather Advisory",
  "Cold Weather Advisory",
  "Wind Chill Advisory",
  "Dense Fog Advisory",
  "Flood Advisory",
  "Air Quality Alert",
];
/** Watches and warnings for boats and the coast: not for a pack outing. */
const SKIP = /\b(marine|gale|storm surge|hurricane force wind|small craft|special marine|coastal flood|lakeshore flood|beach hazards|rip current|hazardous seas|heavy freezing spray|low water|ashfall)\b/i;

/** Should leaders get a phone alert for this kind of alert? Watches, warnings and the main advisories. */
export function alertWorthPush(event: string): boolean {
  const e = event.trim();
  if (SKIP.test(e)) return false;
  return /\b(warning|watch)$/i.test(e) || PUSH_ADVISORIES.some((a) => a.toLowerCase() === e.toLowerCase());
}

/**
 * Leaders who hear about an event's weather (by adult id): key leaders, the Cubmaster and
 * admins for every event; den leaders for pack-wide events and for their own den's or rank's.
 * `leaders` are active adults with a leader role; `denLeaders` say which den each leads.
 */
export function weatherRecipients(
  e: { den_id: string | null; ranks?: string[] | null },
  leaders: { id: string; role: string }[],
  denLeaders: { adult_id: string; den_id: string; rank: string | null }[],
): string[] {
  const packWide = !e.den_id && !e.ranks?.length;
  const ids = new Set<string>();
  for (const a of leaders) if (a.role !== "den_leader" || packWide) ids.add(a.id);
  if (!packWide) {
    const active = new Set(leaders.map((a) => a.id));
    for (const d of denLeaders) {
      if (!active.has(d.adult_id)) continue;
      if (d.den_id === e.den_id || (d.rank !== null && e.ranks?.includes(d.rank))) ids.add(d.adult_id);
    }
  }
  return [...ids];
}

/** Is this a warning-level alert (the weather is happening or about to)? */
export function isWarning(event: string): boolean {
  return /\bwarning$/i.test(event.trim());
}

const whenWeekday = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" });
const whenTime = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

/** "Sat 9 AM", "Sat 9:30 AM", or "Sat" for an all-day event. */
export function shortWhen(e: { starts_at: string; all_day?: boolean | null }): string {
  const d = new Date(e.starts_at);
  const day = whenWeekday.format(d);
  if (e.all_day) return day;
  return `${day} ${whenTime.format(d).replace(":00", "").replace(/ /g, " ")}`;
}

/** "Fri 2 PM until Fri 10 PM", "Until Sat 8 PM", or null when the alert gives no times. */
export function alertWhen(a: { onset: string | null; ends: string | null }): string | null {
  if (a.onset && a.ends) return `${shortWhen({ starts_at: a.onset })} until ${shortWhen({ starts_at: a.ends })}`;
  if (a.ends) return `Until ${shortWhen({ starts_at: a.ends })}`;
  if (a.onset) return `From ${shortWhen({ starts_at: a.onset })}`;
  return null;
}

/** "Severe Thunderstorm Watch for Rocket Derby (Sat 9 AM)" */
export function alertPushTitle(a: { event: string }, e: { title: string; starts_at: string; all_day?: boolean | null }): string {
  return `${a.event} for ${e.title} (${shortWhen(e)})`;
}

/** Has this alert (or an earlier version of it) already gone out for the event? */
export function alreadySent(a: WeatherAlert, sentIds: Set<string>): boolean {
  return sentIds.has(a.id) || a.references.some((r) => sentIds.has(r));
}

// ---------------------------------------------------------------------------------------------
// Pictures

export type WeatherKind = "thunder" | "snow" | "ice" | "rain" | "drizzle" | "fog" | "wind" | "clear" | "partly" | "cloudy" | "hot" | "cold";

/** The picture for a forecast ("Chance Showers And Thunderstorms" → thunder): the roughest weather it mentions wins. */
export function weatherKind(short: string): WeatherKind {
  const s = short.toLowerCase();
  if (/thunder|t-storm|tstorm/.test(s)) return "thunder";
  if (/freezing|sleet|ice|wintry/.test(s)) return "ice";
  if (/snow|flurr|blizzard/.test(s)) return "snow";
  if (/drizzle/.test(s)) return "drizzle";
  if (/rain|shower/.test(s)) return "rain";
  if (/fog|haze|smoke|dust/.test(s)) return "fog";
  if (/^(breezy|windy|blustery)/.test(s)) return "wind";
  if (/^hot\b/.test(s)) return "hot";
  if (/^(cold|frigid)\b/.test(s)) return "cold";
  if (/mostly (sunny|clear)/.test(s)) return "clear";
  if (/partly|mostly cloudy then|becoming sunny|clearing/.test(s)) return "partly";
  if (/cloud|overcast/.test(s)) return "cloudy";
  if (/sunny|clear|fair/.test(s)) return "clear";
  return "cloudy";
}
