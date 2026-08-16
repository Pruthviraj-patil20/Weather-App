/* ─────────────────────────────────────────────────────────────
   SKYCAST — config.js
   Central configuration.

   API credentials resolution order:
     1. window.SKYCAST_CONFIG      → injected via a git-ignored
                                     `js/config.local.js` or a build step
                                     (recommended for production / CI).
     2. localStorage "skycast:settings".apiKey
                                     → user-supplied key saved from the
                                     Settings → Data → API key field.
     3. Sensible defaults            → UI still renders, data won't load.

   ⚠️  Because SKYCAST is a static site, any key that reaches the
   browser is exposed to end users. This is inherent to client-side
   apps. For production, move calls behind a serverless proxy and
   set WEATHER_API_URL to it. See README → Deployment.
   ───────────────────────────────────────────────────────────── */

/* global SKYCAST_CONFIG */
import { Storage } from "./storage.js";

const DEFAULT_API_URL = "https://api.openweathermap.org";

const AppConfig = {
  APP_NAME: "SKYCAST",
  APP_TAGLINE: "Weather, beautifully simplified.",
  APP_VERSION: "1.0.0",

  DEFAULT_CITY: { name: "Pune", lat: 18.5204, lon: 73.8567 },

  openWeatherUrl: function () {
    return (window.SKYCAST_CONFIG && window.SKYCAST_CONFIG.WEATHER_API_URL) || DEFAULT_API_URL;
  },

  /** API key from (1) injected global, else (2) user settings. */
  apiKey: function () {
    if (window.SKYCAST_CONFIG && window.SKYCAST_CONFIG.WEATHER_API_KEY) {
      return window.SKYCAST_CONFIG.WEATHER_API_KEY;
    }
    const settings = Storage.getSettings();
    return (settings && settings.apiKey) || "";
  },

  /** Enable extended 8-day forecast via One Call 3.0 (paid). */
  extendedForecast: function () {
    if (window.SKYCAST_CONFIG && typeof window.SKYCAST_CONFIG.WEATHER_API_EXTENDED !== "undefined") {
      return window.SKYCAST_CONFIG.WEATHER_API_EXTENDED === "1" || window.SKYCAST_CONFIG.WEATHER_API_EXTENDED === true;
    }
    return false;
  },

  lang: function () {
    return (window.SKYCAST_CONFIG && window.SKYCAST_CONFIG.WEATHER_API_LANG) || "en";
  },

  /** Normalised app settings with defaults. */
  defaults: {
    theme: "system",
    units: "metric",        // metric | imperial
    windSpeed: "auto",      // auto | kmh | mph  (auto follows units)
    timeFormat: "12h",      // 12h | 24h
    useGeolocation: true,
    apiKey: "",
  },
};

export { AppConfig };