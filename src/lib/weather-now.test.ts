import { test } from "node:test";
import assert from "node:assert/strict";
import { happeningNow, parseObservation, parsePoint, parseStations } from "./weather-nws";

test("the point names its stations list (on api.weather.gov only)", () => {
  const p = parsePoint({ properties: { forecast: "https://api.weather.gov/gridpoints/LWX/100,80/forecast", observationStations: "https://api.weather.gov/gridpoints/LWX/100,80/stations" } });
  assert.equal(p?.stationsUrl, "https://api.weather.gov/gridpoints/LWX/100,80/stations");
  const bad = parsePoint({ properties: { forecast: "https://api.weather.gov/x", observationStations: "https://evil.example/stations" } });
  assert.equal(bad?.stationsUrl, null);
});

test("the nearest station's latest reading", () => {
  const s = parseStations({ features: [{ properties: { stationIdentifier: "KBWI", name: "Baltimore-Washington International Airport" } }] });
  assert.equal(s?.latestUrl, "https://api.weather.gov/stations/KBWI/observations/latest");
  assert.equal(parseStations({ features: [{ properties: { stationIdentifier: "../x" } }] }), null);
  const at = "2026-10-24T14:00:00+00:00";
  const now = Date.parse(at) + 20 * 60000;
  const c = parseObservation({ properties: { timestamp: at, textDescription: "Light Rain", temperature: { unitCode: "wmoUnit:degC", value: 16.1 } } }, "BWI", now);
  assert.deepEqual(c, { tempF: 61, text: "Light Rain", at, station: "BWI" });
  assert.equal(parseObservation({ properties: { timestamp: at, temperature: { value: null } } }, null, now), null, "no temperature");
  assert.equal(parseObservation({ properties: { timestamp: at, temperature: { value: 10 } } }, null, Date.parse(at) + 3 * 3600000), null, "too old");
});

test("right now shows from an hour before the start until the end", () => {
  const e = { starts_at: "2026-10-24T13:00:00Z", ends_at: "2026-10-26T15:00:00Z", all_day: false };
  assert.equal(happeningNow(e, Date.parse("2026-10-24T11:30:00Z")), false);
  assert.equal(happeningNow(e, Date.parse("2026-10-24T12:30:00Z")), true);
  assert.equal(happeningNow(e, Date.parse("2026-10-26T15:00:00Z")), false);
});
