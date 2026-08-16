/* ─────────────────────────────────────────────────────────────
   SKYCAST — location.js
   Browser geolocation with graceful fallbacks. Never throws into
   the UI — resolves a location or resolves null.
   ───────────────────────────────────────────────────────────── */

import { Storage } from "./storage.js";
import { AppConfig } from "./config.js";
import { reverseGeocode } from "./api.js";

const Location = {
  /** Resolve the active location for the app. Priority:
   *   1. Explicitly requested place (search / favorite).
   *   2. Geolocation (if enabled + granted).
   *   3. Last known location (persisted).
   *   4. Default city.
   */
  resolve(customPlace) {
    if (customPlace && customPlace.lat !== undefined) {
      return Promise.resolve(customPlace);
    }
    const settings = Storage.getSettings();
    if (settings.useGeolocation) {
      return this.fromBrowser()
        .catch(() => this.lastKnown())
        .catch(() => this.defaultCity());
    }
    return this.lastKnown().catch(() => this.defaultCity());
  },

  /** Ask the browser for coordinates. Rejects on deny/error. */
  fromBrowser() {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) {
        reject(new Error("Geolocation not supported"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          let place = { name: "", lat: latitude, lon: longitude, key: `${latitude.toFixed(2)},${longitude.toFixed(2)}` };
          try {
            const named = await reverseGeocode(latitude, longitude);
            if (named) place = { ...place, ...named };
          } catch (err) {
            /* reverse geocoding is best-effort; keep coords */
          }
          Storage.saveLastLocation(place);
          resolve(place);
        },
        (err) => {
          let message = "Location permission denied.";
          if (err.code === err.POSITION_UNAVAILABLE) message = "Location unavailable.";
          if (err.code === err.TIMEOUT) message = "Location request timed out.";
          reject(new Error(message));
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 }
      );
    });
  },

  /** Fall back to the last persisted location. */
  lastKnown() {
    const last = Storage.getLastLocation();
    if (last && last.lat !== undefined) return Promise.resolve(last);
    return Promise.reject(new Error("No last location"));
  },

  /** Final fallback. */
  defaultCity() {
    const d = AppConfig.DEFAULT_CITY;
    return Promise.resolve({
      name: d.name,
      lat: d.lat,
      lon: d.lon,
      key: `${d.lat.toFixed(2)},${d.lon.toFixed(2)}`,
      country: "",
    });
  },
};

export { Location };