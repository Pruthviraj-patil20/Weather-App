/* ─────────────────────────────────────────────────────────────
   SKYCAST — theme.js
   Light / Dark / System theme management with persistence and
   system-preference detection. No page reload on change.
   ───────────────────────────────────────────────────────────── */

import { Storage } from "./storage.js";

const media = window.matchMedia("(prefers-color-scheme: dark)");

const Theme = {
  _current: null,

  /** Resolve the actual theme for a stored preference. */
  resolve(pref) {
    if (pref === "light" || pref === "dark") return pref;
    return media.matches ? "dark" : "light";
  },

  init() {
    const saved = Storage.getTheme();
    this.apply(saved);

    media.addEventListener("change", () => {
      if (Storage.getTheme() === "system") this.apply("system");
    });

    document.addEventListener("skycast:settings", () => {
      this.apply(Storage.getTheme());
    });
  },

  /** Apply a preference and sync UI controls + sidebar toggle. */
  apply(pref) {
    const resolved = this.resolve(pref);
    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.style.colorScheme = resolved;
    this._current = resolved;

    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      const icon = btn.querySelector("svg use");
      if (icon) {
        icon.setAttribute("href", `#icon-${resolved === "dark" ? "moon" : "sun"}`);
      }
    });

    this.syncThemeOptions();
  },

  /** Reflect active theme inside settings page. */
  syncThemeOptions() {
    const pref = Storage.getTheme();
    document.querySelectorAll("[data-theme-option]").forEach((opt) => {
      opt.classList.toggle("is-active", opt.dataset.themeOption === pref);
      opt.setAttribute("aria-pressed", opt.dataset.themeOption === pref ? "true" : "false");
    });
  },

  set(pref) {
    Storage.saveTheme(pref);
    this.apply(pref);
  },

  toggle() {
    const next = this._current === "dark" ? "light" : "dark";
    this.set(next);
    return next;
  },
};

export { Theme };