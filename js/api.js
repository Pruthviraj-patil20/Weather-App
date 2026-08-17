/* ─────────────────────────────────────────────────────────────
   SKYCAST — api.js
   Single home for all network I/O. Everything else imports from
   here; no fetch calls live in pages or UI code.

   Provider: OpenWeatherMap
     • /data/2.5/weather        current weather (by coords)
     • /data/2.5/forecast       5 day / 3 hour forecast
     • /data/3.0/onecall        extended 8-day forecast (paid)
     • /data/2.5/air_pollution  air quality (by coords)
     • /geo/1.0/direct          city search
     • /geo/1.0/reverse         reverse geocoding
   ───────────────────────────────────────────────────────────── */

import { AppConfig } from "./config.js";
import { Storage } from "./storage.js";

/* ── Typed errors ─────────────────────────────────────────── */
class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = "ApiError";
    this.code = code;   // "no-key" | "invalid-key" | "rate-limit" | "not-found" | "network" | "server" | "empty"
    this.status = status;
  }
}

async function request(path, params = {}) {
  const key = AppConfig.apiKey();
  if (!key) {
    throw new ApiError(
      "No API key configured. Add one in Settings → Data, or via js/config.local.js.",
      "no-key"
    );
  }

  const url = new URL(`${AppConfig.openWeatherUrl()}${path}`);
  url.searchParams.set("appid", key);
  url.searchParams.set("lang", AppConfig.lang());
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });

  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new ApiError("Unable to reach the weather service. Check your connection.", "network");
  }

  if (!res.ok) {
    switch (res.status) {
      case 401:
        throw new ApiError("Invalid API key. Check your key in Settings → Data.", "invalid-key", 401);
      case 404:
        throw new ApiError("Location not found. Try a different city name.", "not-found", 404);
      case 429:
        throw new ApiError("Rate limit reached. Please wait a moment and try again.", "rate-limit", 429);
      default:
        throw new ApiError("The weather service returned an error. Try again later.", "server", res.status);
    }
  }

  const data = await res.json().catch(() => {
    throw new ApiError("Unexpected response from the weather service.", "server");
  });
  return data;
}

/* ── Public API surface ───────────────────────────────────── */

/** OpenWeather Air Pollution returns an overall index on a 1–5 scale.
    Map each band to a representative US-EPA AQI value so the UI can
    render a meaningful number, category and gauge position. */
const OWM_AQI_VALUE = { 1: 25, 2: 75, 3: 125, 4: 175, 5: 275 };

/** Current weather for coordinates. */
async function getCurrentWeather(lat, lon) {
  const data = await request("/data/2.5/weather", {
    lat,
    lon,
    units: "metric",
  });
  return normalizeCurrent(data, lat, lon);
}

/** 5-day / 3-hour forecast (free). Returns raw 40-point list. */
async function getRawForecast(lat, lon) {
  const data = await request("/data/2.5/forecast", {
    lat,
    lon,
    units: "metric",
  });
  return data.list;
}

/** Extended daily forecast (One Call 3.0, paid). Returns daily list or null. */
async function getExtendedForecast(lat, lon) {
  if (!AppConfig.extendedForecast()) return null;
  try {
    const data = await request("/data/3.0/onecall", {
      lat,
      lon,
      exclude: "current,minutely,hourly,alerts",
      units: "metric",
    });
    return (data.daily || []).map(normalizeDaily).slice(0, 8);
  } catch (err) {
    console.warn("[api] extended forecast unavailable, falling back to 5-day:", err.message);
    return null;
  }
}

/** Air quality index for coordinates. */
async function getAirQuality(lat, lon) {
  const data = await request("/data/2.5/air_pollution", { lat, lon });
  if (!data || !data.list || !data.list[0]) return null;
  const comp = data.list[0].components;
  const owmIndex = data.list[0].main.aqi;
  return {
    aqi: OWM_AQI_VALUE[owmIndex] ?? owmIndex,
    owmIndex,
    pm25: comp.pm2_5,
    pm10: comp.pm10,
    co: comp.co,
    no2: comp.no2,
    so2: comp.so2,
    o3: comp.o3,
  };
}

/** Search cities by name. */
async function searchCity(query) {
  const trimmed = (query || "").trim();
  if (!trimmed) return [];
  const data = await request("/geo/1.0/direct", { q: trimmed, limit: 6 });
  return (data || []).map(normalizePlace);
}

/** Reverse geocode coordinates into a place. */
async function reverseGeocode(lat, lon) {
  const data = await request("/geo/1.0/reverse", { lat, lon, limit: 1 });
  const place = data && data[0];
  if (!place) return null;
  return {
    name: place.name,
    country: place.country || "",
    state: place.state || "",
    lat: place.lat,
    lon: place.lon,
    key: `${place.lat.toFixed(2)},${place.lon.toFixed(2)}`,
  };
}

/* ── Normalisation ────────────────────────────────────────── */

function normalizeCurrent(raw, lat, lon) {
  return {
    key: `${lat.toFixed(2)},${lon.toFixed(2)}`,
    lat,
    lon,
    name: raw.name || "",
    country: raw.sys?.country || "",
    dt: raw.dt,
    timezoneOffset: raw.timezone || 0,

    temp: Math.round(raw.main?.temp ?? 0),
    feelsLike: Math.round(raw.main?.feels_like ?? 0),
    tempMin: Math.round(raw.main?.temp_min ?? 0),
    tempMax: Math.round(raw.main?.temp_max ?? 0),
    pressure: raw.main?.pressure ?? 0,
    humidity: raw.main?.humidity ?? 0,

    windSpeed: raw.wind?.speed ?? 0,
    windDeg: raw.wind?.deg ?? 0,

    visibility: raw.visibility ?? 0,
    cloudiness: raw.clouds?.all ?? 0,

    precipitation: Math.round((raw.rain && Object.values(raw.rain)[0]) || 0 * 100),

    weatherId: raw.weather?.[0]?.id ?? 800,
    condition: raw.weather?.[0]?.description ?? "",
    iconKey: mapIcon(raw.weather?.[0]?.id, raw.weather?.[0]?.icon),

    sunrise: raw.sys?.sunrise ?? 0,
    sunset: raw.sys?.sunset ?? 0,
  };
}

function normalizeDaily(day) {
  return {
    dt: day.dt,
    tempMin: Math.round(day.temp?.min ?? day.temp?.night ?? 0),
    tempMax: Math.round(day.temp?.max ?? day.temp?.day ?? 0),
    dayTemp: Math.round(day.temp?.day ?? 0),
    feelsLikeDay: Math.round(day.feels_like?.day ?? 0),
    humidity: day.humidity ?? 0,
    pressure: day.pressure ?? 0,
    windSpeed: day.wind_speed ?? 0,
    windDeg: day.wind_deg ?? 0,
    clouds: day.clouds ?? 0,
    pop: Math.round((day.pop ?? 0) * 100),
    rain: day.rain ?? 0,
    uvi: day.uvi ?? 0,
    weatherId: day.weather?.[0]?.id ?? 800,
    condition: day.weather?.[0]?.description ?? "",
    iconKey: mapIcon(day.weather?.[0]?.id, day.weather?.[0]?.icon),
    sunrise: day.sunrise ?? 0,
    sunset: day.sunset ?? 0,
  };
}

function normalizePlace(geo) {
  return {
    key: `${geo.lat.toFixed(2)},${geo.lon.toFixed(2)}`,
    name: geo.name || "Unknown",
    state: geo.state || "",
    country: geo.country || "",
    lat: geo.lat,
    lon: geo.lon,
  };
}

/** OpenWeather condition code → SKYCAST icon key. */
function mapIcon(id, icon) {
  const isNight = typeof icon === "string" && icon.endsWith("n");
  if (id === 800) return isNight ? "clear-night" : "clear-day";
  if (id >= 801 && id <= 802) return isNight ? "partly-night" : "partly-day";
  if (id >= 803 && id <= 804) return "cloudy";
  if (id >= 300 && id < 400) return "drizzle";
  if (id >= 500 && id < 600) return "rain";
  if (id >= 600 && id < 700) return "snow";
  if (id >= 700 && id < 800) return "mist";
  if (id >= 200 && id < 300) return "storm";
  return "clear-day";
}

export {
  ApiError,
  request,
  getCurrentWeather,
  getRawForecast,
  getExtendedForecast,
  getAirQuality,
  searchCity,
  reverseGeocode,
  mapIcon,
  normalizeDaily,
};