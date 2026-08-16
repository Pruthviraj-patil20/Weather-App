/* ─────────────────────────────────────────────────────────────
   SKYCAST — weather.js
   Data service: fetches and combines current weather, forecasts
   and air quality; aggregates hourly/daily series; derives the
   dynamic scene; provides unit-aware formatters.
   ───────────────────────────────────────────────────────────── */

import {
  getCurrentWeather,
  getRawForecast,
  getExtendedForecast,
  getAirQuality,
  normalizeDaily,
  mapIcon,
} from "./api.js";
import { AppConfig } from "./config.js";
import { Storage } from "./storage.js";

/* ── Unit helpers ─────────────────────────────────────────── */
const Settings = {
  units: "metric",
  windSpeed: "auto",
  timeFormat: "12h",
};

function refreshSettings() {
  const s = Storage.getSettings();
  Settings.units = s.units || "metric";
  Settings.windSpeed = s.windSpeed || "auto";
  Settings.timeFormat = s.timeFormat || "12h";
}

function toDisplayTemp(celsius) {
  if (Settings.units === "imperial") return Math.round((celsius * 9) / 5 + 32);
  return Math.round(celsius);
}

function tempUnit() {
  return Settings.units === "imperial" ? "°F" : "°C";
}

function toDisplaySpeed(ms) {
  if (Settings.units === "imperial" || Settings.windSpeed === "mph") {
    return Math.round(ms * 2.23694);
  }
  return Math.round(ms * 3.6);
}

function speedUnit() {
  if (Settings.units === "imperial" || Settings.windSpeed === "mph") return "mph";
  return "km/h";
}

/** Wind direction cardinal from degrees. */
function windCardinal(deg) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

/* ── Time helpers (localised to the place via tz offset) ──── */
function localTime(ts, tzOffsetSeconds) {
  return new Date((ts + (tzOffsetSeconds || 0)) * 1000);
}

function formatTime(ts, tzOffset) {
  const d = localTime(ts, tzOffset);
  const h = d.getUTCHours();
  if (Settings.timeFormat === "24h") {
    return `${String(h).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  }
  const suffix = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(d.getUTCMinutes()).padStart(2, "0")} ${suffix}`;
}

function formatHourLabel(ts, tzOffset, nowTs) {
  const d = localTime(ts, tzOffset);
  if (Math.abs((ts - nowTs) / 3600) < 0.5) return "Now";
  const h = d.getUTCHours();
  if (Settings.timeFormat === "24h") return `${String(h).padStart(2, "0")}:00`;
  const suffix = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh} ${suffix}`;
}

function formatDayLabel(ts, tzOffset, index) {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";
  const d = localTime(ts, tzOffset);
  return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

/* ── Aggregate the free 5-day / 3-hour forecast ───────────── */
function aggregateFromList(list, tzOffset, nowTs) {
  const hourly = list
    .filter((item) => item.dt * 1000 >= nowTs - 3600 * 1000)
    .slice(0, 24)
    .map((item) => ({
      ts: item.dt,
      temp: Math.round(item.main?.temp ?? 0),
      weatherId: item.weather?.[0]?.id ?? 800,
      condition: item.weather?.[0]?.description ?? "",
      iconKey: mapIcon(item.weather?.[0]?.id ?? 800, item.weather?.[0]?.icon ?? "d"),
      pop: Math.round((item.pop ?? 0) * 100),
      humidity: item.main?.humidity ?? 0,
      windSpeed: item.wind?.speed ?? 0,
      dt: item.dt,
    }));

  const dailyMap = new Map();
  for (const item of list) {
    const d = localTime(item.dt, tzOffset);
    const dayKey = d.toISOString().slice(0, 10);
    const entry = dailyMap.get(dayKey);
    const t = Math.round(item.main?.temp ?? 0);
    const pop = Math.round((item.pop ?? 0) * 100);
    if (!entry) {
      dailyMap.set(dayKey, {
        dayKey,
        dt: item.dt,
        temps: [t],
        pops: [pop],
        weatherId: item.weather?.[0]?.id ?? 800,
        condition: item.weather?.[0]?.description ?? "",
        humidity: item.main?.humidity ?? 0,
        windSpeed: item.wind?.speed ?? 0,
      });
    } else {
      entry.temps.push(t);
      entry.pops.push(pop);
      if (item.main?.humidity) entry.humidity = Math.round((entry.humidity + item.main.humidity) / 2);
      if (item.wind?.speed) entry.windSpeed = Math.max(entry.windSpeed, item.wind.speed);
    }
  }

  const daily = Array.from(dailyMap.values()).slice(0, 7).map((d, i) => ({
    dt: d.dt,
    index: i,
    tempMin: Math.min(...d.temps),
    tempMax: Math.max(...d.temps),
    pop: Math.round(d.pops.reduce((a, b) => a + b, 0) / d.pops.length),
    humidity: d.humidity,
    windSpeed: d.windSpeed,
    weatherId: d.weatherId,
    condition: d.condition,
  }));

  return { hourly, daily };
}

/* ── UV index estimation ────────────────────────────────────
   OpenWeatherMap's free tier has no UV field, so we estimate UV
   from solar elevation (clear-sky model) damped by cloud cover.
   Enough to power a believable Low → Extreme indicator. */
function estimateUV(current, lat) {
  const { sunrise, sunset, dt, cloudiness, timezoneOffset } = current;
  if (!sunrise || !sunset) return 0;
  const now = localTime(dt, timezoneOffset).getTime() / 1000;
  if (now < sunrise || now > sunset) return 0;

  const solarNoon = (sunrise + sunset) / 2;
  const halfDay = (sunset - sunrise) / 2 || 1;
  const hourAngle = ((now - solarNoon) / halfDay) * (Math.PI / 2);

  const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 1)) / 86400000);
  const decl = 23.44 * Math.sin(((360 / 365) * (dayOfYear - 81)) * (Math.PI / 180));
  const sinAlt =
    Math.sin((lat * Math.PI) / 180) * Math.sin((decl * Math.PI) / 180) +
    Math.cos((lat * Math.PI) / 180) * Math.cos((decl * Math.PI) / 180) * Math.cos(hourAngle);
  const elevation = Math.asin(Math.max(0, Math.min(1, sinAlt)));
  if (elevation <= 0) return 0;

  const clearSkyUV = 8 * Math.pow(Math.sin(elevation), 1.3);
  const cloudFactor = 1 - (cloudiness / 100) * 0.6;
  return Math.max(0, Math.round(clearSkyUV * cloudFactor * 10) / 10);
}

function uvCategory(uvi) {
  if (uvi <= 2) return "Low";
  if (uvi <= 5) return "Moderate";
  if (uvi <= 7) return "High";
  if (uvi <= 10) return "Very High";
  return "Extreme";
}

/* ── AQI helpers ──────────────────────────────────────────── */
const AQI_LEVELS = [
  { max: 50, label: "Good", color: "var(--aqi-good)" },
  { max: 100, label: "Moderate", color: "var(--aqi-moderate)" },
  { max: 150, label: "Unhealthy for Sensitive Groups", color: "var(--aqi-unhealthy-sensitive)" },
  { max: 200, label: "Unhealthy", color: "var(--aqi-unhealthy)" },
  { max: 300, label: "Very Unhealthy", color: "var(--aqi-very-unhealthy)" },
  { max: Infinity, label: "Hazardous", color: "var(--aqi-hazardous)" },
];

function aqiCategory(aqi) {
  return AQI_LEVELS.find((l) => aqi <= l.max) || AQI_LEVELS[AQI_LEVELS.length - 1];
}

/* ── Scene derivation for dynamic backgrounds ─────────────── */
function deriveScene(current) {
  const now = localTime(current.dt, current.timezoneOffset);
  const hour = now.getUTCHours();
  const isDay = hour >= 6 && hour < 19;
  const id = current.weatherId;

  if (id >= 200 && id < 300) return "storm";
  if (id >= 600 && id < 700) return "snow";
  if (id >= 700 && id < 800) return "mist";
  if (id >= 500 && id < 600) return "rain";
  if (id >= 300 && id < 400) return "rain";
  if (id >= 801 && id <= 804) return "cloudy";
  if (id === 800) return isDay ? "clear-day" : "clear-night";
  return isDay ? "clear-day" : "clear-night";
}

/* ── Weather condition labels (EN override for nicer copy) ── */
const CONDITION_LABELS = {
  200: "Thunderstorm with light rain", 201: "Thunderstorm with rain",
  202: "Thunderstorm with heavy rain", 210: "Light thunderstorm", 211: "Thunderstorm",
  212: "Heavy thunderstorm", 221: "Ragged thunderstorm", 230: "Thunderstorm with light drizzle",
  231: "Thunderstorm with drizzle", 232: "Thunderstorm with heavy drizzle",
  300: "Light drizzle", 301: "Drizzle", 302: "Heavy drizzle",
  310: "Light rain drizzle", 311: "Drizzle rain", 312: "Heavy drizzle rain",
  313: "Showers of rain and drizzle", 314: "Heavy showers of rain and drizzle", 321: "Shower drizzle",
  500: "Light rain", 501: "Rain", 502: "Heavy rain", 503: "Very heavy rain",
  504: "Extreme rain", 511: "Freezing rain", 520: "Light shower rain", 521: "Shower rain",
  522: "Heavy shower rain", 531: "Ragged shower rain",
  600: "Light snow", 601: "Snow", 602: "Heavy snow", 611: "Sleet",
  612: "Light sleet showers", 613: "Sleet showers", 615: "Light freezing rain",
  616: "Freezing rain", 620: "Light snow showers", 621: "Snow showers", 622: "Heavy snow showers",
  701: "Mist", 711: "Smoke", 721: "Haze", 731: "Sand / dust whirls",
  741: "Fog", 751: "Sand", 761: "Dust", 762: "Volcanic ash", 771: "Squalls", 781: "Tornado",
  800: "Clear", 801: "Partly Cloudy", 802: "Partly Cloudy", 803: "Mostly Cloudy", 804: "Overcast",
};

function conditionLabel(id, fallback) {
  return CONDITION_LABELS[id] || fallback || "Unknown";
}

/* ── Main fetch orchestration ─────────────────────────────── */
async function fetchAll(lat, lon) {
  refreshSettings();

  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = Storage.getCache(cacheKey);
  if (cached) return cached;

  const current = await getCurrentWeather(lat, lon);

  let hourly = [];
  let daily = [];
  let extended = false;

  const extendedDaily = await getExtendedForecast(lat, lon);
  if (extendedDaily && extendedDaily.length) {
    daily = extendedDaily;
    extended = true;
  }

  const raw = await getRawForecast(lat, lon);
  const { hourly: aggHourly, daily: aggDaily } = aggregateFromList(
    raw,
    current.timezoneOffset,
    Date.now() / 1000
  );
  hourly = aggHourly;
  if (!extended) daily = aggDaily;

  const airQuality = await getAirQuality(lat, lon).catch(() => null);

  const uvi = estimateUV(current, lat);

  const result = {
    current: { ...current, uvi, uvCategory: uvCategory(uvi) },
    hourly,
    daily,
    airQuality,
    extended,
    fetchedAt: Date.now(),
  };

  Storage.setCache(cacheKey, result);
  return result;
}

export {
  refreshSettings,
  toDisplayTemp,
  tempUnit,
  toDisplaySpeed,
  speedUnit,
  windCardinal,
  formatTime,
  formatHourLabel,
  formatDayLabel,
  estimateUV,
  uvCategory,
  aqiCategory,
  deriveScene,
  conditionLabel,
  fetchAll,
  AQI_LEVELS,
};