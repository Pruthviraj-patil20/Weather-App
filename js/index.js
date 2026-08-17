/* ─────────────────────────────────────────────────────────────
   SKYCAST — index.js
   Application entry point. Wires storage, theme, location,
   search, favorites and the weather dashboard together.
   ───────────────────────────────────────────────────────────── */

import { AppConfig } from "./config.js";
import { Storage } from "./storage.js";
import { Theme } from "./theme.js";
import { Location } from "./location.js";
import { searchCity } from "./api.js";
import { SceneEffects } from "./effects.js";
import {
  fetchAll,
  refreshSettings,
  toDisplayTemp,
  tempUnit,
  toDisplaySpeed,
  speedUnit,
  windCardinal,
  formatTime,
  formatHourLabel,
  formatDayLabel,
  aqiCategory,
  conditionLabel,
  deriveScene,
} from "./weather.js";

/* ── DOM helpers ──────────────────────────────────────────── */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ── State ────────────────────────────────────────────────── */
const state = {
  place: null,
  data: null,
  loading: false,
};

/* ── Weather icon (inline SVG via iconKey) ───────────────── */
const ICONS = {
  "clear-day": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  "clear-night": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  "partly-day": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v2M4.22 4.22l1.42 1.42M2 12h2M4.22 19.78l1.42-1.42M12 20v2M19.78 19.78l-1.42-1.42M20 12h2"/><path d="M17 10h1a4 4 0 0 1 0 8h-6"/><circle cx="12" cy="11" r="3"/></svg>`,
  "partly-night": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/><path d="M17 16h2M21 16h-2"/></svg>`,
  cloudy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`,
  drizzle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6v6M12 6v6M16 6v6M6 12a5 5 0 0 1 12 0"/><line x1="8" y1="15" x2="8" y2="17"/><line x1="12" y1="15" x2="12" y2="17"/><line x1="16" y1="15" x2="16" y2="17"/></svg>`,
  rain: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 13a8 8 0 0 0-16 0h16z"/><line x1="8" y1="15" x2="8" y2="19"/><line x1="12" y1="15" x2="12" y2="19"/><line x1="16" y1="15" x2="16" y2="19"/></svg>`,
  snow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M4 7l16 10M20 7L4 17"/></svg>`,
  mist: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5h14M5 9h14M5 13h14M5 17h14"/></svg>`,
  storm: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L4.09 12.69a.5.5 0 0 0 .4.81H11l-2 8 8.91-10.69a.5.5 0 0 0-.4-.81H13l2-8z"/></svg>`,
};

function setIcon(container, iconKey) {
  if (container) container.innerHTML = ICONS[iconKey] || ICONS["clear-day"];
}

/* ── Scenes ───────────────────────────────────────────────── */
function applyScene() {
  const { data } = state;
  const scene = $("#scene");
  const hero = $("#hero-weather");
  if (!data || !scene) return;

  const sceneKey = deriveScene(data.current);
  scene.classList.remove(
    "is-clear-day", "is-clear-night", "is-cloudy", "is-rain", "is-storm", "is-snow", "is-mist"
  );
  scene.classList.add(`is-${sceneKey}`);

  SceneEffects.render(sceneKey);

  if (hero) {
    hero.classList.remove("is-night", "is-rain", "is-storm", "is-snow", "is-cloudy");
    const map = { "clear-night": "is-night", rain: "is-rain", storm: "is-storm", snow: "is-snow", cloudy: "is-cloudy" };
    if (map[sceneKey]) hero.classList.add(map[sceneKey]);
  }
}

/* ── Rendering ────────────────────────────────────────────── */
function locationLabel() {
  const c = state.data && state.data.current;
  const place = state.place || {};
  return c?.name || place?.name || "--";
}

/** Show the current place on every card so data is always
    attributed to a location. */
function renderLocations() {
  const name = locationLabel();
  const pin = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
  $$("[data-location]").forEach((node) => {
    node.innerHTML = `${pin}<span class="loc-text">${name}</span>`;
  });
  if ($("#pill-location-name")) $("#pill-location-name").textContent = name;
  if ($("#sidebar-location-name")) $("#sidebar-location-name").textContent = name;
}

function renderCurrent() {
  const { data } = state;
  if (!data) return;

  const c = data.current;
  const place = state.place || {};
  const name = c.name || place.name || "--";
  const country = c.country || place.country || "";

  $("#hero-city-name").textContent = name;
  $("#hero-country").textContent = country || "—";
  if ($("#sidebar-location-name")) $("#sidebar-location-name").textContent = name;
  if ($("#pill-location-name")) $("#pill-location-name").textContent = name;
  $("#greeting").textContent = `Good ${dayGreeting()}`;
  const greetingEl = $("#greeting-location-name") || $("#location-country");
  if (greetingEl) greetingEl.textContent = `${name}${country ? ", " + country : ""}`;
  $("#temperature").textContent = toDisplayTemp(c.temp);
  $("#temp-unit").textContent = tempUnit();
  $("#weather-description").textContent = conditionLabel(c.weatherId, c.condition);
  $("#feels-like").textContent = `Feels like ${toDisplayTemp(c.feelsLike)}°${tempUnit().replace("°", "")}`;
  setIcon($("#weather-icon"), c.iconKey);

  $("#high").textContent = `${toDisplayTemp(c.tempMax)}°`;
  $("#low").textContent = `${toDisplayTemp(c.tempMin)}°`;

  $("#humidity").textContent = `${c.humidity}%`;
  $("#wind").textContent = `${toDisplaySpeed(c.windSpeed)} ${speedUnit()}`;
  $("#pressure").textContent = `${c.pressure} hPa`;

  const updated = new Date(data.fetchedAt);
  const s = Storage.getSettings();
  const timeFormat = s.timeFormat || "12h";
  if (timeFormat === "24h") {
    $("#hero-updated").textContent = `Updated ${updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else {
    const h = updated.getHours();
    const suffix = h >= 12 ? "PM" : "AM";
    const hh = h % 12 === 0 ? 12 : h % 12;
    $("#hero-updated").textContent = `Updated ${hh}:${updated.getMinutes().toString().padStart(2, "0")} ${suffix}`;
  }
  $("#hero-updated-label").textContent = `Live · ${conditionLabel(c.weatherId, c.condition)}`;

  const fav = Storage.isFavorite(c.key);
  $("#favorite-btn").setAttribute("aria-pressed", String(fav));
  $("#favorite-btn").classList.toggle("is-faved", fav);

  applyScene();
  renderLocations();
  renderAirQuality();
  renderUV();
  renderHourly();
  renderWeekly();
  renderForecastPage();
  renderDetails();
}

function dayGreeting() {
  const h = new Date().getHours();
  if (h < 5) return "night";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function renderAirQuality() {
  const aq = state.data && state.data.airQuality;
  const grid = $("#aqi-grid");
  grid.innerHTML = "";

  if (!aq) {
    $("#aqi-value").textContent = "--";
    $("#aqi-label").textContent = "Unavailable";
    $("#aqi-marker").style.left = "0%";
    return;
  }

  const cat = aqiCategory(aq.aqi);
  $("#aqi-value").textContent = aq.aqi;
  $("#aqi-label").textContent = cat.label;
  const pct = Math.min(100, (aq.aqi / 500) * 100);
  $("#aqi-marker").style.left = `${pct}%`;

  const pollutants = [
    ["PM2.5", aq.pm25, "µg/m³"],
    ["PM10", aq.pm10, "µg/m³"],
    ["O₃", aq.o3, "µg/m³"],
    ["NO₂", aq.no2, "µg/m³"],
    ["SO₂", aq.so2, "µg/m³"],
    ["CO", aq.co, "µg/m³"],
  ];

  pollutants.forEach(([label, value, unit]) => {
    const item = el("div", "aqi-item");
    item.appendChild(el("span", "aqi-item-name", label));
    item.appendChild(el("span", "aqi-item-value", `${value ?? "--"} ${unit}`));
    grid.appendChild(item);
  });
}

function renderUV() {
  const c = state.data && state.data.current;
  if (!c) return;
  const uvi = c.uvi ?? 0;
  $("#uv-number").textContent = uvi;
  $("#uv-category").textContent = c.uvCategory || "--";
  $("#uv-marker").style.left = `${Math.min(100, (uvi / 11) * 100)}%`;
  const notes = {
    Low: "Wear sunglasses on bright days.",
    Moderate: "Stay in shade near midday.",
    High: "Use SPF 30+ and shade at midday.",
    "Very High": "Avoid sun 10am–4pm, SPF 50+.",
    Extreme: "Extra protection needed. Avoid sun.",
  };
  $("#uv-note").textContent = notes[c.uvCategory] || "UV data is estimated.";
}

function renderHourly() {
  const { data } = state;
  const strip = $("#hourly-strip");
  strip.innerHTML = "";

  if (!data) {
    strip.appendChild(el("p", "empty-note", "Hourly data unavailable."));
    return;
  }

  const tz = data.current.timezoneOffset;
  const nowTs = Date.now() / 1000;

  data.hourly.slice(0, 12).forEach((h, i) => {
    const cell = el("div", "hourly-cell");
    if (i === 0) cell.classList.add("is-now");
    cell.appendChild(el("span", "h-time", formatHourLabel(h.dt, tz, nowTs)));
    const iconBox = el("div", "h-icon");
    setIcon(iconBox, h.iconKey);
    cell.appendChild(iconBox);
    cell.appendChild(el("span", "h-temp", `${toDisplayTemp(h.temp)}°`));
    const rain = el("span", "h-rain");
    rain.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6v6M12 6v6M16 6v6"/><line x1="8" y1="15" x2="8" y2="17"/><line x1="12" y1="15" x2="12" y2="17"/><line x1="16" y1="15" x2="16" y2="17"/></svg> ${h.pop}%`;
    cell.appendChild(rain);
    strip.appendChild(cell);
  });
}

function renderWeekly() {
  const { data } = state;
  const list = $("#weekly-list");
  list.innerHTML = "";

  if (!data) {
    list.appendChild(el("p", "empty-note", "Forecast unavailable."));
    return;
  }

  const tz = data.current.timezoneOffset;

  data.daily.slice(0, 7).forEach((d, i) => {
    const row = el("div", "weather-row");
    const day = el("span", "wr-day", formatDayLabel(d.dt, tz, i));
    if (i === 0) day.classList.add("is-today");
    row.appendChild(day);
    const iconBox = el("div", "wr-icon");
    setIcon(iconBox, d.iconKey);
    row.appendChild(iconBox);
    row.appendChild(el("span", "wr-cond", conditionLabel(d.weatherId, d.condition)));
    const rain = el("span", "wr-rain");
    rain.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6v6M12 6v6M16 6v6"/></svg> ${d.pop ?? 0}%`;
    row.appendChild(rain);
    row.appendChild(el("span", "wr-high", `${toDisplayTemp(d.tempMax)}°`));
    row.appendChild(el("span", "wr-low", `${toDisplayTemp(d.tempMin)}°`));
    list.appendChild(row);
  });
}

function renderForecastPage() {
  const { data } = state;
  if (!data) return;

  const tz = data.current.timezoneOffset;
  const nowTs = Date.now() / 1000;

  const hourly = $("#forecast-hourly");
  hourly.innerHTML = "";
  data.hourly.forEach((h, i) => {
    const cell = el("div", "hour24-cell");
    if (i === 0) cell.classList.add("is-now");
    cell.appendChild(el("span", "h24-time", formatHourLabel(h.dt, tz, nowTs)));
    const iconBox = el("div", "h24-icon");
    setIcon(iconBox, h.iconKey);
    cell.appendChild(iconBox);
    cell.appendChild(el("span", "h24-temp", `${toDisplayTemp(h.temp)}°`));
    const rain = el("span", "h24-rain");
    rain.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6v6M12 6v6M16 6v6"/></svg> ${h.pop}%`;
    cell.appendChild(rain);
    hourly.appendChild(cell);
  });

  const daily = $("#forecast-daily");
  daily.innerHTML = "";
  data.daily.forEach((d, i) => {
    const row = el("div", "daily-card-row");
    const dayCol = el("div");
    dayCol.appendChild(el("div", "dc-day", formatDayLabel(d.dt, tz, i)));
    const dateStr = new Date(d.dt * 1000).toLocaleDateString([], { month: "short", day: "numeric" });
    dayCol.appendChild(el("div", "dc-date", dateStr));
    row.appendChild(dayCol);
    const iconBox = el("div", "dc-icon");
    setIcon(iconBox, d.iconKey);
    row.appendChild(iconBox);
    row.appendChild(el("div", "dc-cond", conditionLabel(d.weatherId, d.condition)));
    const rain = el("span", "dc-rain");
    rain.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6v6M12 6v6M16 6v6"/></svg> ${d.pop ?? 0}%`;
    row.appendChild(rain);
    const temps = el("div", "dc-temps");
    temps.appendChild(el("span", "dc-high", `${toDisplayTemp(d.tempMax)}°`));
    temps.appendChild(el("span", "dc-low", `${toDisplayTemp(d.tempMin)}°`));
    row.appendChild(temps);
    daily.appendChild(row);
  });
}

function renderDetails() {
  const c = state.data && state.data.current;
  const grid = $("#detail-grid");
  grid.innerHTML = "";
  if (!c) return;

  const details = [
    ["Humidity", `${c.humidity}%`, "Relative air moisture"],
    ["Wind", `${toDisplaySpeed(c.windSpeed)} ${speedUnit()}`, windCardinal(c.windDeg)],
    ["Pressure", `${c.pressure} hPa`, "Sea-level pressure"],
    ["Visibility", c.visibility ? `${(c.visibility / 1000).toFixed(1)} km` : "--", "Horizontal visibility"],
    ["Cloudiness", `${c.cloudiness}%`, "Sky coverage"],
    ["Precipitation", `${c.precipitation ?? 0} mm`, "Rainfall"],
  ];

  details.forEach(([label, value, note]) => {
    const item = el("div", "detail-stat");
    const icon = el("div", "ds-icon");
    icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`;
    item.appendChild(icon);
    const body = el("div");
    body.appendChild(el("div", "ds-label", label));
    body.appendChild(el("div", "ds-value", value));
    body.appendChild(el("div", "ds-note", note));
    item.appendChild(body);
    grid.appendChild(item);
  });
}

function renderFavorites() {
  const list = Storage.getFavorites();
  const grid = $("#favorites-grid");
  grid.innerHTML = "";

  if (!list.length) {
    const empty = el("div", "state");
    empty.innerHTML = `
      <div class="state-icon is-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      </div>
      <h3>No favorites yet</h3>
      <p>Tap the heart on any city to save it here for quick access.</p>`;
    grid.appendChild(empty);
    return;
  }

  list.forEach((f) => {
    const card = el("div", "fav-card");
    card.appendChild(el("span", "fav-accent"));
    const top = el("div", "fav-card-top");
    const info = el("div");
    info.appendChild(el("div", "fav-city", f.name || "—"));
    info.appendChild(el("div", "fav-country", f.country || ""));
    top.appendChild(info);
    const heart = el("button", "icon-button heart-btn is-faved");
    heart.setAttribute("aria-label", `Remove ${f.name}`);
    heart.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
    heart.addEventListener("click", (e) => {
      e.stopPropagation();
      Storage.removeFavorite(f.key);
      renderFavorites();
    });
    top.appendChild(heart);
    card.appendChild(top);

    const main = el("div", "fav-card-main");
    main.appendChild(el("div", "fav-temp", "—"));
    const iconBox = el("div", "fav-icon");
    iconBox.innerHTML = ICONS["clear-day"];
    main.appendChild(iconBox);
    card.appendChild(main);
    card.appendChild(el("div", "fav-cond", "—"));

    const hl = el("div", "fav-highlow");
    hl.appendChild(el("span", "", "—"));
    hl.appendChild(el("span", "fav-low", "—"));
    card.appendChild(hl);

    card.addEventListener("click", () => {
      loadPlace(f);
      showPage("dashboard");
    });
    grid.appendChild(card);
  });
}

/* ── Loading / error states ───────────────────────────────── */
function setLoading(on) {
  state.loading = on;
  $("#search-input").disabled = on;
}

function showError(message) {
  $("#weather-description").textContent = message || "Something went wrong.";
}

/* ── Data loading ─────────────────────────────────────────── */
async function loadPlace(place, force = false) {
  if (!place || state.loading) return;
  state.place = place;
  state.data = null;
  setLoading(true);

  try {
    const data = await fetchAll(place.lat, place.lon, force);
    state.data = data;
    Storage.saveRecentSearch(place);
    Storage.saveLastLocation(place);
    renderCurrent();
    renderFavorites();
  } catch (err) {
    showError(err.message || "Unable to load weather data.");
    console.error("[skycast]", err);
  } finally {
    setLoading(false);
  }
}

/* ── Search ───────────────────────────────────────────────── */
let searchTimer = null;

function handleSearchInput() {
  const q = $("#search-input").value.trim();
  const box = $("#search-suggestions");
  const bar = $(".search-bar");
  box.innerHTML = "";
  bar.classList.toggle("has-value", q.length > 0);

  clearTimeout(searchTimer);
  if (q.length < 2) return;

  searchTimer = setTimeout(async () => {
    try {
      const results = await searchCity(q);
      if (!results.length) {
        box.appendChild(el("div", "suggestions-empty", "No cities found."));
        return;
      }
      results.forEach((r) => {
        const item = el("button", "suggestion-item");
        item.type = "button";
        item.innerHTML = `
          <span class="sug-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </span>
          <span class="sug-meta">
            <span class="sug-name">${r.name}</span>
            <span class="sug-region">${[r.state, r.country].filter(Boolean).join(", ")}</span>
          </span>`;
        item.addEventListener("click", () => {
          box.innerHTML = "";
          $("#search-input").value = r.name;
          bar.classList.toggle("has-value", true);
          loadPlace(r);
        });
        box.appendChild(item);
      });
    } catch (err) {
      box.appendChild(el("div", "suggestions-empty", err.message || "Search failed."));
    }
  }, 350);
}

/* ── Page navigation ──────────────────────────────────────── */
const PAGE_TITLES = {
  dashboard: "Dashboard",
  forecast: "Forecast",
  favorites: "Favorites",
  settings: "Settings",
};

function showPage(name) {
  $$(".page-view").forEach((v) => {
    v.hidden = v.dataset.view !== name;
  });
  $$("[data-page]").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.page === name);
  });
  $("#page-title").textContent = PAGE_TITLES[name] || "SKYCAST";
  if (name === "favorites") renderFavorites();
  if (name === "settings") renderSettings();
  if (name === "forecast") renderForecastPage();
}

/* ── Settings ─────────────────────────────────────────────── */
function renderSettings() {
  const s = Storage.getSettings();
  const theme = Storage.getTheme() || "system";

  $$("[data-theme-option]").forEach((opt) => {
    opt.classList.toggle("is-active", opt.dataset.themeOption === theme);
    opt.setAttribute("aria-pressed", opt.dataset.themeOption === theme ? "true" : "false");
  });

  $$("[data-unit]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.unit === (s.units || "metric"));
  });

  $("#wind-speed-select").value = s.windSpeed || "auto";
  $("#time-format-select").value = s.timeFormat || "12h";
  $$(".hero-time-format .time-option").forEach((opt) => {
    opt.classList.toggle("is-active", opt.dataset.timeFormat === (s.timeFormat || "12h"));
  });
  $("#geolocation-toggle").checked = s.useGeolocation !== false;
  $("#api-key-input").value = AppConfig.apiKey() || "";
}

/* ── Initialisation ───────────────────────────────────────── */
function bindEvents() {
  $("#theme-toggle").addEventListener("click", () => {
    Theme.toggle();
    renderSettings();
  });

  $$("[data-theme-option]").forEach((btn) => {
    btn.addEventListener("click", () => {
      Theme.set(btn.dataset.themeOption);
      renderSettings();
    });
  });

  $$("[data-theme-rainbow]").forEach((btn) => {
    btn.addEventListener("click", () => {
      Theme.set(btn.dataset.themeRainbow);
      renderSettings();
    });
  });

  $$("[data-unit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      Storage.saveSettings({ units: btn.dataset.unit });
      refreshSettings();
      document.dispatchEvent(new CustomEvent("skycast:settings"));
      renderSettings();
      if (state.data) renderCurrent();
    });
  });

  $("#wind-speed-select").addEventListener("change", (e) => {
    Storage.saveSettings({ windSpeed: e.target.value });
    refreshSettings();
    document.dispatchEvent(new CustomEvent("skycast:settings"));
    if (state.data) renderCurrent();
  });

  $("#time-format-select").addEventListener("change", (e) => {
    Storage.saveSettings({ timeFormat: e.target.value });
    refreshSettings();
    document.dispatchEvent(new CustomEvent("skycast:settings"));
    if (state.data) renderCurrent();
  });

  $$(".hero-time-format .time-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      Storage.saveSettings({ timeFormat: btn.dataset.timeFormat });
      refreshSettings();
      document.dispatchEvent(new CustomEvent("skycast:settings"));
      if (state.data) renderCurrent();
    });
  });

  $("#geolocation-toggle").addEventListener("change", (e) => {
    Storage.saveSettings({ useGeolocation: e.target.checked });
    document.dispatchEvent(new CustomEvent("skycast:settings"));
  });

  $("#map-btn").addEventListener("click", () => {
    if (!state.place) return;
    const { lat, lon } = state.place;
    const query = `${lat},${lon}`;
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank");
  });

  $("#search-input").addEventListener("input", handleSearchInput);
  $("#search-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const q = $("#search-input").value.trim();
      if (q) searchCity(q).then((r) => r[0] && loadPlace(r[0]));
    }
  });
  $("#search-input").addEventListener("focus", () => {
    if ($("#search-input").value.trim().length >= 2) handleSearchInput();
  });
  $("#search-input").addEventListener("blur", () => {
    setTimeout(() => ($("#search-suggestions").innerHTML = ""), 200);
  });
  $("#clear-search").addEventListener("click", () => {
    $("#search-input").value = "";
    $("#search-suggestions").innerHTML = "";
    $(".search-bar").classList.remove("has-value");
  });

  const handleLocationClick = async (btn) => {
    if (state.loading) return;
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = "0.7";
    }
    $("#weather-description").textContent = "Detecting your location…";
    try {
      const place = await Location.fromBrowser(true);
      await loadPlace(place, true);
    } catch (err) {
      showError(err.message || "Location unavailable.");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = "";
      }
    }
  };

  $("#location-btn").addEventListener("click", (e) => {
    handleLocationClick(e.currentTarget);
  });

  $("#settings-btn").addEventListener("click", () => {
    showPage("settings");
  });

  $("#dashboard-location-btn").addEventListener("click", (e) => {
    handleLocationClick(e.currentTarget);
  });

  $("#favorite-btn").addEventListener("click", () => {
    if (!state.data) return;
    const c = state.data.current;
    const place = {
      ...(state.place || {}),
      name: c.name,
      country: c.country,
      lat: c.lat,
      lon: c.lon,
      key: c.key,
    };
    Storage.toggleFavorite(place);
    renderCurrent();
    renderFavorites();
  });

  $$("[data-page]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      showPage(link.dataset.page);
    });
  });

  $("#menu-toggle").addEventListener("click", () => {
    document.body.classList.toggle("nav-open");
  });
  $("#sidebar-overlay").addEventListener("click", () => {
    document.body.classList.remove("nav-open");
  });
  $("#overlay").addEventListener("click", () => {
    document.body.classList.remove("nav-open");
  });

  $("#forecast-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (!btn) return;
    $$("#forecast-tabs [data-tab]").forEach((b) => b.classList.toggle("is-active", b === btn));
    $("#panel-hourly").classList.toggle("is-active", btn.dataset.tab === "hourly");
    $("#panel-daily").classList.toggle("is-active", btn.dataset.tab === "daily");
  });

  $$(".settings-nav .sn-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      $$(".settings-nav .sn-link").forEach((l) => l.classList.toggle("is-active", l === link));
      const target = $(`[data-sg="${link.dataset.sn}"]`);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  $("#save-api-key").addEventListener("click", () => {
    Storage.saveSettings({ apiKey: $("#api-key-input").value.trim() });
    document.dispatchEvent(new CustomEvent("skycast:settings"));
    showError("API key saved.");
    if (state.place) loadPlace(state.place);
  });

  $("#clear-data").addEventListener("click", () => {
    if (!confirm("Clear all data and preferences?")) return;
    Storage.clearAll();
    location.reload();
  });
}

async function init() {
  document.title = `${AppConfig.APP_NAME} — ${AppConfig.APP_TAGLINE}`;
  Theme.init();
  bindEvents();

  const place = await Location.resolve();
  loadPlace(place);
}

document.addEventListener("DOMContentLoaded", init);