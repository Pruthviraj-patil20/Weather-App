/* ─────────────────────────────────────────────────────────────
   SKYCAST — effects.js
   Dynamic weather particle effects rendered into the fx-overlay,
   layered above the app content. Sun rays for clear days, stars
   for clear nights, rain + lightning for storms, snow, fog banks
   and drifting clouds. Honours prefers-reduced-motion.
   ───────────────────────────────────────────────────────────── */

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function smallScreen() {
  return window.matchMedia("(max-width: 767px)").matches;
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

function create(className, layer, style, customProps = {}) {
  const node = document.createElement("span");
  node.className = `${className} fx-particle`;
  Object.assign(node.style, style);
  Object.entries(customProps).forEach(([key, value]) => {
    node.style.setProperty(key, value);
  });
  layer.appendChild(node);
  return node;
}

const SceneEffects = {
  _overlay: null,

  overlay() {
    if (!this._overlay) this._overlay = document.getElementById("fx-overlay");
    return this._overlay;
  },

  clear() {
    const overlay = this.overlay();
    if (!overlay) return;
    overlay.classList.remove("fx-sun", "fx-stars", "fx-rain", "fx-storm", "fx-snow", "fx-fog", "fx-clouds");
    overlay.querySelectorAll(".fx-particle").forEach((node) => node.remove());
  },

  render(sceneKey) {
    const map = {
      "clear-day": "sun",
      "clear-night": "stars",
      cloudy: "clouds",
      rain: "rain",
      storm: "storm",
      snow: "snow",
      mist: "fog",
    };
    this.clear();
    if (prefersReducedMotion()) return;
    const fx = map[sceneKey];
    if (!fx) return;
    if (fx === "storm") {
      this.overlay().classList.add("fx-storm");
      this.rain(true);
    } else {
      this[fx]();
    }
  },

  sun() {
    const overlay = this.overlay();
    if (!overlay) return;
    overlay.classList.add("fx-sun");
  },

  stars() {
    const overlay = this.overlay();
    const layer = overlay && overlay.querySelector("#stars");
    if (!overlay || !layer) return;
    overlay.classList.add("fx-stars");
    const count = smallScreen() ? 30 : 60;
    for (let i = 0; i < count; i++) {
      create("star", layer, {
        left: `${random(0, 100).toFixed(1)}%`,
        top: `${random(0, 55).toFixed(1)}%`,
        width: `${random(1, 2.6).toFixed(1)}px`,
        height: `${random(1, 2.6).toFixed(1)}px`,
        animationDelay: `${random(0, 4).toFixed(2)}s`,
        animationDuration: `${random(2, 5).toFixed(2)}s`,
      });
    }
  },

  rain(storm = false) {
    const overlay = this.overlay();
    const layer = overlay && overlay.querySelector("#raindrops");
    if (!overlay || !layer) return;
    overlay.classList.add("fx-rain");
    const count = smallScreen() ? 40 : 70;
    for (let i = 0; i < count; i++) {
      const drop = create("raindrop", layer, {
        left: `${random(0, 100).toFixed(1)}%`,
        height: `${random(26, 60).toFixed(1)}px`,
        animationDuration: `${random(0.55, 1.2).toFixed(2)}s`,
        animationDelay: `${random(0, 1.4).toFixed(2)}s`,
        opacity: random(0.5, 1).toFixed(2),
      });
      if (storm) drop.classList.add("is-heavy");
    }
  },

  snow() {
    const overlay = this.overlay();
    const layer = overlay && overlay.querySelector("#snowflakes");
    if (!overlay || !layer) return;
    overlay.classList.add("fx-snow");
    const count = smallScreen() ? 28 : 50;
    for (let i = 0; i < count; i++) {
      create("snowflake", layer, {
        left: `${random(0, 100).toFixed(1)}%`,
        width: `${random(3, 8).toFixed(1)}px`,
        height: `${random(3, 8).toFixed(1)}px`,
        animationDuration: `${random(5, 11).toFixed(2)}s`,
        animationDelay: `${random(0, 6).toFixed(2)}s`,
      }, { "--sway": `${random(10, 50).toFixed(1)}px` });
    }
  },

  fog() {
    const overlay = this.overlay();
    const layer = overlay && overlay.querySelector("#fog");
    if (!overlay || !layer) return;
    overlay.classList.add("fx-fog");
    layer.innerHTML = "";
    for (let i = 0; i < 4; i++) {
      create("fog-bank", layer, {
        top: `${random(45, 90).toFixed(0)}%`,
        height: `${random(26, 60).toFixed(0)}px`,
        animationDuration: `${random(22, 42).toFixed(0)}s`,
        animationDelay: `${-random(0, 30).toFixed(0)}s`,
        opacity: random(0.18, 0.34).toFixed(2),
      });
    }
  },

  clouds() {
    const overlay = this.overlay();
    const layer = overlay && overlay.querySelector("#cloud-layer");
    if (!overlay || !layer) return;
    overlay.classList.add("fx-clouds");
    layer.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      create("cloud-puff", layer, {
        top: `${random(4, 34).toFixed(0)}%`,
        transform: `scale(${random(0.7, 1.5).toFixed(2)})`,
        animationDuration: `${random(40, 80).toFixed(0)}s`,
        animationDelay: `${-random(0, 60).toFixed(0)}s`,
      });
    }
  },
};

export { SceneEffects };
