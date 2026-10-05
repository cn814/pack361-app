import { Suspense } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  ExternalLink,
  Info,
  Moon,
  Sun,
  Thermometer,
  TriangleAlert,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { loadEventWeather, type EventWeatherData } from "@/lib/weather";
import { alertWhen, alertWorthPush, forecastPageUrl, weatherKind, type CurrentConditions, type ForecastPeriod, type WeatherAlert, type WeatherKind } from "@/lib/weather-nws";
import { TZ } from "@/lib/tz";
import type { PackEvent } from "@/lib/types";

/**
 * The National Weather Service forecast for an event (and any watches or warnings there), from
 * a week before it starts until it ends. Loads on its own after the rest of the page, and shows
 * nothing when there's no address, no forecast yet, or the Weather Service doesn't answer.
 */
export default function EventWeather({ e }: { e: PackEvent }) {
  return (
    <Suspense fallback={null}>
      <Loaded e={e} />
    </Suspense>
  );
}

async function Loaded({ e }: { e: PackEvent }) {
  const data = await loadEventWeather(e);
  return data ? <EventWeatherView data={data} /> : null;
}

const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" });

const ICON: Record<WeatherKind, { day: LucideIcon; night: LucideIcon }> = {
  thunder: { day: CloudLightning, night: CloudLightning },
  snow: { day: CloudSnow, night: CloudSnow },
  ice: { day: CloudHail, night: CloudHail },
  rain: { day: CloudRain, night: CloudRain },
  drizzle: { day: CloudDrizzle, night: CloudDrizzle },
  fog: { day: CloudFog, night: CloudFog },
  wind: { day: Wind, night: Wind },
  clear: { day: Sun, night: Moon },
  partly: { day: CloudSun, night: CloudMoon },
  cloudy: { day: Cloud, night: Cloud },
  hot: { day: Thermometer, night: Thermometer },
  cold: { day: Thermometer, night: Thermometer },
};

export function EventWeatherView({ data }: { data: EventWeatherData }) {
  const { periods, alerts, point, moreLater, now } = data;
  const source = (
    <p className="text-[11px] text-muted">
      Forecast from the National Weather Service.{" "}
      <a href={forecastPageUrl(point)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-bold text-pine underline-offset-2 hover:underline">
        Full forecast at weather.gov <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
    </p>
  );
  return (
    <section id="weather" className="scroll-mt-20 space-y-2">
      <h2 className="section-title flex items-center gap-1.5">
        <CloudSun className="h-4 w-4" aria-hidden /> Weather
      </h2>
      {alerts.map((a) => (
        <AlertCard key={a.id} a={a} />
      ))}
      {periods.length > 0 || now ? (
        <div className="card space-y-3">
          {now && <NowRow now={now} />}
          <ul className="divide-y divide-line empty:hidden">
            {periods.map((p) => (
              <PeriodRow key={p.startTime} p={p} />
            ))}
          </ul>
          {moreLater && <p className="text-xs text-muted">The rest of the event shows up here as it comes into the 7-day forecast.</p>}
          {source}
        </div>
      ) : (
        source
      )}
    </section>
  );
}

const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

/** While the event is happening: the latest reading at the nearest weather station, one line. */
function NowRow({ now }: { now: CurrentConditions }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-low px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink">
          Right now{now.text ? <span className="font-normal text-navy"> · {now.text}</span> : null}
        </p>
        <p className="truncate text-[11px] text-muted">
          {now.station ? `${now.station}, ` : ""}
          {timeFmt.format(new Date(now.at))}
        </p>
      </div>
      <span className="shrink-0 text-xl font-extrabold text-pine-950">{now.tempF}°</span>
    </div>
  );
}

function PeriodRow({ p }: { p: ForecastPeriod }) {
  const kind = weatherKind(p.short);
  const Icon = ICON[kind][p.isDaytime ? "day" : "night"];
  const sunny = p.isDaytime && (kind === "clear" || kind === "partly" || kind === "hot");
  const wet = kind === "snow" || kind === "ice" ? "snow" : "rain";
  return (
    <li className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <Icon className={`mt-0.5 h-7 w-7 shrink-0 ${sunny ? "text-gold-700" : "text-navy"}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">
          {p.name} <span className="font-normal text-muted">· {dateFmt.format(new Date(p.startTime))}</span>
        </p>
        <p className="text-sm text-navy">{p.short}</p>
        {(p.rain !== null || p.wind) && (
          <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
            {p.rain !== null && (
              <span className={`inline-flex items-center gap-1 ${p.rain >= 50 ? "font-bold text-navy" : ""}`}>
                <Droplets className="h-3.5 w-3.5" aria-hidden /> {p.rain}% chance of {wet}
              </span>
            )}
            {p.wind && (
              <span className="inline-flex items-center gap-1">
                <Wind className="h-3.5 w-3.5" aria-hidden /> Wind {[p.windDirection, p.wind].filter(Boolean).join(" ")}
              </span>
            )}
          </p>
        )}
      </div>
      {p.temperature !== null && (
        <div className="shrink-0 text-right">
          <span className="block text-xl font-extrabold leading-none text-pine-950">
            {Math.round(p.temperature)}°{p.unit === "C" ? "C" : ""}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{p.isDaytime ? "High" : "Low"}</span>
        </div>
      )}
    </li>
  );
}

function AlertCard({ a }: { a: WeatherAlert }) {
  const serious = alertWorthPush(a.event);
  const Icon = serious ? TriangleAlert : Info;
  const when = alertWhen(a);
  return (
    <div role={serious ? "alert" : undefined} className={`card space-y-1.5 border-l-4 ${serious ? "border-l-danger bg-danger-50" : "border-l-gold"}`}>
      <h3 className={`flex items-center gap-1.5 font-extrabold ${serious ? "text-danger" : "text-pine-950"}`}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        {a.event}
      </h3>
      {when && <p className="text-sm font-semibold text-ink">{when}</p>}
      {(a.instruction || a.description) && (
        <details className="text-sm text-ink">
          <summary className="cursor-pointer font-bold text-pine">What the Weather Service says</summary>
          <div className="space-y-2 pt-2">
            {a.instruction && (
              <p className="whitespace-pre-line">
                <span className="font-bold">What to do: </span>
                {a.instruction}
              </p>
            )}
            {a.description && <p className="whitespace-pre-line text-navy">{a.description}</p>}
          </div>
        </details>
      )}
    </div>
  );
}
