/* ─────────────────────────────────────────────────────────────
   SKYCAST — storage.js
   Single, namespaced LocalStorage wrapper. All persistence in the
   app goes through this module — never touch localStorage directly
   elsewhere.
   ───────────────────────────────────────────────────────────── */

import { AppConfig } from "./config.js";

const NS = "skycast";

const KEYS = {
  favorites: `${NS}:favorites`,
  recent: `${NS}:recent`,
  settings: `${NS}:settings`,
  theme: `${NS}:theme`,
  lastLocation: `${NS}:lastLocation`,
  cache: `${NS}:cache`,
};

const MAX_RECENT = 8;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const Storage = {
  _read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (err) {
      console.warn("[storage] read failed", key, err);
      return fallback;
    }
  },

  _write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn("[storage] write failed", key, err);
      return false;
    }
  },

  _remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn("[storage] remove failed", key, err);
    }
  },

  /* ── Favourites ──────────────────────────────────────── */
  getFavorites() {
    return this._read(KEYS.favorites, []);
  },

  saveFavorites(list) {
    return this._write(KEYS.favorites, Array.isArray(list) ? list : []);
  },

  isFavorite(key) {
    return this.getFavorites().some((f) => f.key === key);
  },

  addFavorite(city) {
    if (!city || !city.key) return this.getFavorites();
    const list = this.getFavorites().filter((f) => f.key !== city.key);
    list.unshift(city);
    this.saveFavorites(list.slice(0, 12));
    return list;
  },

  removeFavorite(key) {
    const list = this.getFavorites().filter((f) => f.key !== key);
    this.saveFavorites(list);
    return list;
  },

  toggleFavorite(city) {
    return this.isFavorite(city.key) ? this.removeFavorite(city.key) : this.addFavorite(city);
  },

  /* ── Recent searches ─────────────────────────────────── */
  getRecentSearches() {
    return this._read(KEYS.recent, []);
  },

  saveRecentSearch(place) {
    if (!place || !place.name) return this.getRecentSearches();
    const list = this.getRecentSearches().filter(
      (p) => !(p.name === place.name && p.lat === place.lat && p.lon === place.lon)
    );
    list.unshift(place);
    const trimmed = list.slice(0, MAX_RECENT);
    this._write(KEYS.recent, trimmed);
    return trimmed;
  },

  clearRecentSearches() {
    this._remove(KEYS.recent);
  },

  /* ── Settings ────────────────────────────────────────── */
  getSettings() {
    return Object.assign({}, AppConfig.defaults, this._read(KEYS.settings, {}));
  },

  saveSettings(patch) {
    const next = Object.assign({}, this.getSettings(), patch);
    this._write(KEYS.settings, next);
    return next;
  },

  resetSettings() {
    this._remove(KEYS.settings);
    return this.getSettings();
  },

  /* ── Theme ───────────────────────────────────────────── */
  getTheme() {
    return this._read(KEYS.theme, "system");
  },

  saveTheme(theme) {
    this._write(KEYS.theme, theme);
  },

  /* ── Last known location ─────────────────────────────── */
  getLastLocation() {
    return this._read(KEYS.lastLocation, null);
  },

  saveLastLocation(loc) {
    this._write(KEYS.lastLocation, loc);
  },

  /* ── Weather data cache ──────────────────────────────── */
  getCache(key) {
    const entry = this._read(KEYS.cache, {})[key];
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL) return null;
    return entry.data;
  },

  setCache(key, data) {
    const all = this._read(KEYS.cache, {});
    all[key] = { ts: Date.now(), data };
    this._write(KEYS.cache, all);
  },

  clearCache() {
    this._remove(KEYS.cache);
  },

  /* ── Clear everything (user data only) ───────────────── */
  clearAll() {
    Object.values(KEYS).forEach((k) => this._remove(k));
  },
};

export { Storage };