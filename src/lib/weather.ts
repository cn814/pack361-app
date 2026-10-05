import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminConfigured, createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";
import { pushConfigured, sendPushTo } from "./push";
import { eventPath } from "./featured";
import { LEADER_ROLES, type DenRank } from "./types";
import {
  ALERT_DAYS_AHEAD,
  NWS_USER_AGENT,
  alertPushTitle,
  alertWhen,
  alertWorthPush,
  alertsForEvent,
  alertsUrl,
  alreadySent,
  censusUrl,
  eventWindow,
  forecastEndsEarly,
  geocodeCandidates,
  parseAlerts,
  parseCensusMatch,
  parseForecast,
  parsePoint,
  periodsForEvent,
  placeText,
  pointsUrl,
  showWeather,
  happeningNow,
  parseObservation,
  parseStations,
  type CurrentConditions,
  type ForecastPeriod,
  type WeatherAlert,
  type WeatherEvent,
  type WeatherPoint,
  weatherRecipients,
} from "./weather-nws";

// Weather for events, from the National Weather Service (free, no key; it asks for a
// User-Agent with a contact). Event pages show the forecast from a week out, and the daily job
// tells leaders about watches and warnings for events in the next few days.
// Coordinates come from the Census geocoder, looked up once per address and kept on the event
// (events.lat / lon / geocoded_address); a changed address is looked up again.

const TIMEOUT_MS = 5000;

/** Seconds a Weather Service answer is kept and reused (Next's data cache). */
const CACHE = { points: 86400, forecast: 1800, alerts: 600, stations: 86400, latest: 600 } as const;

/**
 * GET some JSON. Null on any failure (offline, slow, an error page, not JSON): the weather is a
 * nice-to-have and never breaks a page. `revalidate: 0` always asks fresh.
 */
async function getJson(url: string, revalidate: number, accept = "application/geo+json"): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": NWS_USER_AGENT, Accept: accept },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...(revalidate > 0 ? { next: { revalidate } } : { cache: "no-store" as const }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** The Census geocoder couldn't be reached (as opposed to finding nothing). */
export class GeocodeError extends Error {}

/**
 * Look up the event's address once with the Census geocoder and keep the result on the event
 * (secret-key client: families can't change events). Finding nothing is kept too (no
 * coordinates, but the address it was tried for), so the same address isn't asked about again;
 * a changed address is. Throws GeocodeError when the geocoder couldn't be reached.
 */
export async function geocodeEvent(e: { id: string; location_name: string | null; address: string | null }, db?: SupabaseClient): Promise<WeatherPoint | null> {
  const place = placeText(e);
  if (!place) return null;
  let point: WeatherPoint | null = null;
  let reached = false;
  for (const q of geocodeCandidates(e)) {
    const json = await getJson(censusUrl(q), 0, "application/json");
    if (json === null) continue;
    reached = true;
    point = parseCensusMatch(json);
    if (point) break;
  }
  if (!reached && geocodeCandidates(e).length) throw new GeocodeError("Couldn't reach the Census geocoder");
  const admin = db ?? (adminConfigured() ? createAdminClient() : null);
  if (admin) {
    await admin
      .from("events")
      .update({ lat: point?.lat ?? null, lon: point?.lon ?? null, geocoded_address: place.slice(0, 1000) })
      .eq("id", e.id);
  }
  return point;
}

interface Located {
  lat: number | string | null;
  lon: number | string | null;
  geocoded_address: string | null;
}

/** The event's coordinates: kept ones while the address hasn't changed, else looked up now. */
async function pointFor(e: WeatherEvent, saved: Located | null, db?: SupabaseClient): Promise<WeatherPoint | null> {
  const place = placeText(e);
  if (!place) return null;
  if (saved && saved.geocoded_address === place.slice(0, 1000)) {
    const lat = saved.lat === null ? NaN : Number(saved.lat);
    const lon = saved.lon === null ? NaN : Number(saved.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null; // looked up before, nothing found
  }
  return geocodeEvent(e, db);
}

/** Forecast periods for the spot: /points, then the forecast it names. Null when unavailable. */
async function fetchForecast(p: WeatherPoint): Promise<ForecastPeriod[] | null> {
  const point = parsePoint(await getJson(pointsUrl(p), CACHE.points));
  if (!point) return null;
  const json = await getJson(point.forecastUrl, CACHE.forecast);
  return json === null ? null : parseForecast(json);
}

/** The latest reading at the nearest station: /points, its stations, the first one's latest. */
async function fetchNow(p: WeatherPoint): Promise<CurrentConditions | null> {
  const point = parsePoint(await getJson(pointsUrl(p), CACHE.points));
  if (!point?.stationsUrl) return null;
  const station = parseStations(await getJson(point.stationsUrl, CACHE.stations));
  if (!station) return null;
  return parseObservation(await getJson(station.latestUrl, CACHE.latest), station.name);
}

/** Alerts in force at the spot. Null when the Weather Service couldn't be reached. */
async function fetchAlerts(p: WeatherPoint, fresh = false): Promise<WeatherAlert[] | null> {
  const json = await getJson(alertsUrl(p), fresh ? 0 : CACHE.alerts);
  return json === null ? null : parseAlerts(json);
}

/** The event's coordinates (saved from an earlier lookup, or looked up now). Null if none. Never throws. */
export async function eventPoint(e: WeatherEvent): Promise<WeatherPoint | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("events").select("lat, lon, geocoded_address").eq("id", e.id).maybeSingle();
    if (error) return null;
    return await pointFor(e, (data as Located | null) ?? null);
  } catch {
    return null;
  }
}

export interface EventWeatherData {
  point: WeatherPoint;
  /** The forecast's half-days that cover the event (empty when it's too far out or unavailable). */
  periods: ForecastPeriod[];
  /** Alerts whose weather overlaps the event. */
  alerts: WeatherAlert[];
  /** The forecast doesn't reach the end of the event yet. */
  moreLater: boolean;
  /** While the event is under way: the latest reading at the nearest station. */
  now: CurrentConditions | null;
}

/**
 * The weather for an event page, or null when there's nothing to show: outside the week before
 * the event, no address or none the geocoder knows, or the Weather Service didn't answer.
 * Never throws.
 */
export async function loadEventWeather(e: WeatherEvent & { archived_at?: string | null }): Promise<EventWeatherData | null> {
  try {
    if (e.archived_at || !showWeather(e)) return null;
    const supabase = await createClient();
    const { data, error } = await supabase.from("events").select("lat, lon, geocoded_address").eq("id", e.id).maybeSingle();
    if (error) return null;
    const point = await pointFor(e, (data as Located | null) ?? null);
    if (!point) return null;
    const [forecast, alerts, now] = await Promise.all([fetchForecast(point), fetchAlerts(point), happeningNow(e) ? fetchNow(point) : null]);
    const periods = periodsForEvent(forecast ?? [], e);
    const mine = alertsForEvent(alerts ?? [], e);
    if (!periods.length && !mine.length && !now) return null;
    return { point, periods, alerts: mine, moreLater: forecastEndsEarly(forecast ?? [], e), now };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Daily job

type JobEvent = WeatherEvent &
  Located & {
    category: string;
    den_id: string | null;
    ranks: DenRank[] | null;
    rsvp_enabled: boolean | null;
  };

/**
 * Once a day (in the daily cron): for events in the next three days (and ones under way) that
 * aren't leaders-only and have an address, check the Weather Service's active alerts there. For
 * a watch, warning or major advisory whose weather overlaps the event, push the event's leaders
 * ("Severe Thunderstorm Watch for Rocket Derby (Sat 9 AM)", opening the event, where they can
 * message the families going). Each alert goes out once per event (weather_alerts_sent),
 * including later updates of it; one that reached no phone is tried again on the next run.
 */
export async function weatherJob(db: SupabaseClient): Promise<{ checked: number; alerted: number; errors?: string[] }> {
  if (!pushConfigured()) return { checked: 0, alerted: 0 };
  const now = Date.now();
  const { data, error } = await db
    .from("events")
    .select("id, title, category, starts_at, ends_at, all_day, location_name, address, den_id, ranks, rsvp_enabled, lat, lon, geocoded_address")
    .eq("leaders_only", false)
    .is("archived_at", null)
    // Campouts that started up to two weeks ago may still be going.
    .gte("starts_at", new Date(now - 14 * 86400000).toISOString())
    .lte("starts_at", new Date(now + ALERT_DAYS_AHEAD * 86400000).toISOString())
    .order("starts_at")
    .limit(60);
  if (error) throw new Error(error.message);
  const events = ((data ?? []) as unknown as JobEvent[]).filter((e) => eventWindow(e).end > now && placeText(e));
  if (!events.length) return { checked: 0, alerted: 0 };

  const [leaderRes, denRes, sentRes] = await Promise.all([
    db.from("adults").select("id, role").eq("is_active", true).in("role", LEADER_ROLES),
    db.from("den_leaders").select("adult_id, den_id, den:dens(rank)"),
    db.from("weather_alerts_sent").select("event_id, alert_id").in("event_id", events.map((e) => e.id)),
  ]);
  if (leaderRes.error) throw new Error(leaderRes.error.message);
  if (sentRes.error) throw new Error(sentRes.error.message);
  const leaders = (leaderRes.data ?? []) as { id: string; role: string }[];
  const denLeaders = ((denRes.data ?? []) as unknown as { adult_id: string; den_id: string; den: { rank: DenRank } | null }[]).map((d) => ({
    adult_id: d.adult_id,
    den_id: d.den_id,
    rank: d.den?.rank ?? null,
  }));
  const sent = new Map<string, Set<string>>();
  for (const r of (sentRes.data ?? []) as { event_id: string; alert_id: string }[]) {
    sent.set(r.event_id, (sent.get(r.event_id) ?? new Set()).add(r.alert_id));
  }

  const errors: string[] = [];
  const alertsAt = new Map<string, Promise<WeatherAlert[] | null>>(); // one request per spot
  let checked = 0;
  let alerted = 0;
  for (const e of events) {
    let point: WeatherPoint | null;
    try {
      point = await pointFor(e, e, db);
    } catch (err) {
      errors.push(`${e.title}: ${err instanceof Error ? err.message : "address lookup failed"}`);
      continue;
    }
    if (!point) continue;
    checked++;
    const key = `${point.lat},${point.lon}`;
    if (!alertsAt.has(key)) alertsAt.set(key, fetchAlerts(point, true));
    const alerts = await alertsAt.get(key)!;
    if (alerts === null) {
      errors.push(`${e.title}: couldn't reach the Weather Service`);
      continue;
    }
    const mine = sent.get(e.id) ?? new Set<string>();
    for (const a of alertsForEvent(alerts, e).filter((a) => alertWorthPush(a.event))) {
      if (alreadySent(a, mine)) {
        // An update of one already sent: remember this version too, so its next update is known.
        if (!mine.has(a.id)) {
          await db.from("weather_alerts_sent").upsert({ event_id: e.id, alert_id: a.id, alert_event: a.event }, { onConflict: "event_id,alert_id", ignoreDuplicates: true });
          mine.add(a.id);
        }
        continue;
      }
      const to = weatherRecipients(e, leaders, denLeaders);
      if (!to.length) continue;
      const when = alertWhen(a);
      const res = await sendPushTo(to, {
        title: alertPushTitle(a, e),
        body: [when ? `${when}.` : null, e.rsvp_enabled ? "Open the event to message the families going." : "Open the event for the details."].filter(Boolean).join(" "),
        url: eventPath(e),
        tag: `weather-${e.id}-${a.event.toLowerCase().replace(/[^a-z]+/g, "-")}`,
      });
      if (!res.sent) {
        if (res.errors.length) errors.push(`${e.title}: ${res.errors[0]}`);
        continue;
      }
      const { error: saveErr } = await db
        .from("weather_alerts_sent")
        .upsert({ event_id: e.id, alert_id: a.id, alert_event: a.event }, { onConflict: "event_id,alert_id", ignoreDuplicates: true });
      if (saveErr) errors.push(`Couldn't record the ${a.event} alert for ${e.title}: ${saveErr.message}`);
      mine.add(a.id);
      sent.set(e.id, mine);
      alerted++;
    }
  }
  return { checked, alerted, ...(errors.length ? { errors } : {}) };
}
