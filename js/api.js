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

/* ── US EPA AQI & Live Air Quality / UV Service ────────────── */

/** Calculate continuous US EPA Air Quality Index from individual pollutant concentrations */
function calculateEpaAqi(comp = {}) {
  function calcSegment(c, cLow, cHigh, iLow, iHigh) {
    return Math.round(((iHigh - iLow) / (cHigh - cLow)) * (c - cLow) + iLow);
  }
  function aqiFromPm25(c) {
    if (c <= 12.0) return calcSegment(c, 0, 12.0, 0, 50);
    if (c <= 35.4) return calcSegment(c, 12.1, 35.4, 51, 100);
    if (c <= 55.4) return calcSegment(c, 35.5, 55.4, 101, 150);
    if (c <= 150.4) return calcSegment(c, 55.5, 150.4, 151, 200);
    if (c <= 250.4) return calcSegment(c, 150.5, 250.4, 201, 300);
    if (c <= 500.4) return calcSegment(c, 250.5, 500.4, 301, 500);
    return 500;
  }
  function aqiFromPm10(c) {
    if (c <= 54) return calcSegment(c, 0, 54, 0, 50);
    if (c <= 154) return calcSegment(c, 55, 154, 51, 100);
    if (c <= 254) return calcSegment(c, 155, 254, 101, 150);
    if (c <= 354) return calcSegment(c, 255, 354, 151, 200);
    if (c <= 424) return calcSegment(c, 355, 424, 201, 300);
    if (c <= 604) return calcSegment(c, 425, 604, 301, 500);
    return 500;
  }
  function aqiFromO3(c) {
    if (c <= 108) return calcSegment(c, 0, 108, 0, 50);
    if (c <= 140) return calcSegment(c, 109, 140, 51, 100);
    if (c <= 170) return calcSegment(c, 141, 170, 101, 150);
    if (c <= 210) return calcSegment(c, 171, 210, 151, 200);
    if (c <= 400) return calcSegment(c, 211, 400, 201, 300);
    return 300;
  }
  function aqiFromNo2(c) {
    if (c <= 100) return calcSegment(c, 0, 100, 0, 50);
    if (c <= 200) return calcSegment(c, 101, 200, 51, 100);
    if (c <= 700) return calcSegment(c, 201, 700, 101, 150);
    if (c <= 1200) return calcSegment(c, 701, 1200, 151, 200);
    return 200;
  }
  function aqiFromSo2(c) {
    if (c <= 70) return calcSegment(c, 0, 70, 0, 50);
    if (c <= 140) return calcSegment(c, 71, 140, 51, 100);
    if (c <= 300) return calcSegment(c, 141, 300, 101, 150);
    if (c <= 600) return calcSegment(c, 301, 600, 151, 200);
    return 200;
  }
  function aqiFromCo(c) {
    if (c <= 5000) return calcSegment(c, 0, 5000, 0, 50);
    if (c <= 10000) return calcSegment(c, 5001, 10000, 51, 100);
    if (c <= 14000) return calcSegment(c, 10001, 14000, 101, 150);
    if (c <= 17000) return calcSegment(c, 14001, 17000, 151, 200);
    return 200;
  }

  const sub = [];
  if (comp.pm25 != null && !isNaN(comp.pm25)) sub.push(aqiFromPm25(Number(comp.pm25)));
  if (comp.pm10 != null && !isNaN(comp.pm10)) sub.push(aqiFromPm10(Number(comp.pm10)));
  if (comp.o3 != null && !isNaN(comp.o3)) sub.push(aqiFromO3(Number(comp.o3)));
  if (comp.no2 != null && !isNaN(comp.no2)) sub.push(aqiFromNo2(Number(comp.no2)));
  if (comp.so2 != null && !isNaN(comp.so2)) sub.push(aqiFromSo2(Number(comp.so2)));
  if (comp.co != null && !isNaN(comp.co)) sub.push(aqiFromCo(Number(comp.co)));

  return sub.length ? Math.max(1, Math.max(...sub)) : 30;
}

/** Fetch live Open-Meteo Air Quality & UV data (Free, global, satellite-calibrated) */
async function fetchOpenMeteoAirQuality(lat, lon) {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,european_aqi,pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,uv_index`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo air quality error: ${res.status}`);
  const data = await res.json();
  const c = data.current || {};
  return {
    aqi: typeof c.us_aqi === "number" ? c.us_aqi : calculateEpaAqi({
      pm25: c.pm2_5,
      pm10: c.pm10,
      co: c.carbon_monoxide,
      no2: c.nitrogen_dioxide,
      so2: c.sulphur_dioxide,
      o3: c.ozone,
    }),
    europeanAqi: c.european_aqi,
    uvi: typeof c.uv_index === "number" ? Math.round(c.uv_index * 10) / 10 : null,
    pm25: c.pm2_5 != null ? Math.round(c.pm2_5 * 10) / 10 : null,
    pm10: c.pm10 != null ? Math.round(c.pm10 * 10) / 10 : null,
    co: c.carbon_monoxide != null ? Math.round(c.carbon_monoxide * 10) / 10 : null,
    no2: c.nitrogen_dioxide != null ? Math.round(c.nitrogen_dioxide * 10) / 10 : null,
    so2: c.sulphur_dioxide != null ? Math.round(c.sulphur_dioxide * 10) / 10 : null,
    o3: c.ozone != null ? Math.round(c.ozone * 10) / 10 : null,
    source: "open-meteo",
  };
}

/** Fetch air quality with fallback between OpenWeather and Open-Meteo. */
async function getAirQuality(lat, lon) {
  // First try Open-Meteo for high-accuracy real-time AQI and all 6 pollutants
  try {
    const omData = await fetchOpenMeteoAirQuality(lat, lon);
    if (omData && typeof omData.aqi === "number") return omData;
  } catch (err) {
    console.warn("[api] Open-Meteo air quality unavailable, checking OpenWeather:", err.message);
  }

  // Next try OpenWeatherMap air pollution endpoint if key is available
  try {
    const data = await request("/data/2.5/air_pollution", { lat, lon });
    if (data && data.list && data.list[0]) {
      const comp = data.list[0].components || {};
      const owmIndex = data.list[0].main?.aqi ?? 1;
      const components = {
        pm25: comp.pm2_5 != null ? Math.round(comp.pm2_5 * 10) / 10 : null,
        pm10: comp.pm10 != null ? Math.round(comp.pm10 * 10) / 10 : null,
        co: comp.co != null ? Math.round(comp.co * 10) / 10 : null,
        no2: comp.no2 != null ? Math.round(comp.no2 * 10) / 10 : null,
        so2: comp.so2 != null ? Math.round(comp.so2 * 10) / 10 : null,
        o3: comp.o3 != null ? Math.round(comp.o3 * 10) / 10 : null,
      };
      const calculatedAqi = calculateEpaAqi(components);
      return {
        aqi: calculatedAqi,
        owmIndex,
        ...components,
        source: "openweather",
      };
    }
  } catch (err) {
    console.warn("[api] OpenWeather air pollution unavailable:", err.message);
  }

  return null;
}

/** Fetch live UV Index from Open-Meteo. */
async function getLiveUV(lat, lon) {
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=uv_index`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.current && typeof data.current.uv_index === "number") {
      return Math.round(data.current.uv_index * 10) / 10;
    }
  } catch (err) {
    console.warn("[api] Live UV fetch error:", err.message);
  }
  return null;
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
  getLiveUV,
  calculateEpaAqi,
  searchCity,
  reverseGeocode,
  mapIcon,
  normalizeDaily,
};