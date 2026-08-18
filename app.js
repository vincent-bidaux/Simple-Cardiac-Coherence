// Simple Cardiac Coherence — respiration guidée par un cercle.

// --- i18n -------------------------------------------------------------
// L'app se sert dans la langue du navigateur : français par défaut,
// anglais pour toute autre langue (couverture large avec un texte
// vérifié plutôt que beaucoup de langues non relues).
const STRINGS = {
  fr: {
    ready: "Démarrer",
    inhale: "Inspire",
    exhale: "Expire",
    pause: "Pause",
    finished: "Terminé",
    ariaCircle: "Démarrer ou mettre en pause la séance",
    ariaModes: "Choisir un mode de respiration",
    ariaTitle: "En savoir plus sur l'app",
    info: "La cohérence cardiaque est une technique de respiration lente et régulière qui synchronise votre rythme cardiaque pour réduire le stress. Choisissez un rythme en bas de l'écran, puis respirez en suivant le cercle : il grandit à l'inspiration, il se réduit à l'expiration.",
    description: "Cohérence cardiaque guidée : un cercle bleu clair grandit et se réduit selon 3 rythmes de respiration recommandés.",
    modes: {
      standard: { label: "Standard 365", detail: "6 resp/min · 5 min" },
      profond: { label: "Profond", detail: "4,5 resp/min · 5 min" },
      express: { label: "Express", detail: "6 resp/min · 3 min" },
    },
  },
  en: {
    ready: "Start",
    inhale: "Breathe in",
    exhale: "Breathe out",
    pause: "Paused",
    finished: "Done",
    ariaCircle: "Start or pause the session",
    ariaModes: "Choose a breathing mode",
    ariaTitle: "Learn more about the app",
    info: "Cardiac coherence is a slow, regular breathing technique that synchronizes your heart rate to reduce stress. Pick a rhythm at the bottom of the screen, then breathe along with the circle: it grows as you breathe in, and shrinks as you breathe out.",
    description: "Guided cardiac coherence: a light blue circle grows and shrinks following 3 recommended breathing rhythms.",
    modes: {
      standard: { label: "Standard 365", detail: "6 breaths/min · 5 min" },
      profond: { label: "Deep", detail: "4.5 breaths/min · 5 min" },
      express: { label: "Express", detail: "6 breaths/min · 3 min" },
    },
  },
};

function detectLocale() {
  const lang = (navigator.language || "fr").toLowerCase();
  return lang.startsWith("fr") ? "fr" : "en";
}

const LOCALE = detectLocale();
const T = STRINGS[LOCALE];

// 3 modes = 3 couples (rythme, durée) parmi les plus recommandés en
// cohérence cardiaque :
// - "365" (Dr David O'Hare) : 6 respirations/minute, 5 minutes, 3x/jour —
//   c'est LA référence, retenue ici comme mode par défaut.
// - la fréquence de résonance individuelle se situe généralement entre
//   4,5 et 7 resp/min : "Profond" couvre le bas de cette plage pour une
//   pratique plus avancée, "Express" garde le rythme de référence dans
//   un format court pour un reset rapide dans la journée.
const MODES = [
  { id: "standard", bpm: 6, durationMin: 5 },
  { id: "profond", bpm: 4.5, durationMin: 5 },
  { id: "express", bpm: 6, durationMin: 3 },
];

const DEFAULT_MODE_ID = "standard";

// Tailles exprimées en fraction de vmin/cqmin (le cercle a une boîte de
// base de 100%, transform:scale() représente donc directement cette
// fraction).
const VMIN_REST = 0.1; // au lancement de l'app / après la fin d'un programme
const VMIN_MIN = 0.2; // taille mini pendant la respiration
const VMIN_MAX = 0.9; // taille maxi (= le contour de référence)
const VMIN_MID = (VMIN_MIN + VMIN_MAX) / 2;
const VMIN_AMP = (VMIN_MAX - VMIN_MIN) / 2;
const WARMUP_MS = 260; // montée rapide de repos -> taille mini au démarrage
const SETTLE_MS = 450; // redescente en douceur vers le repos à la fin
const LOAD_GROW_MS = 500; // apparition en douceur au chargement de la page

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const header = document.querySelector(".header");
const bottomUi = document.querySelector(".bottom-ui");
const stage = document.getElementById("stage");
const titleToggle = document.getElementById("titleToggle");
const infoPanel = document.getElementById("infoPanel");
const circle = document.getElementById("circle");
const phaseLabel = document.getElementById("phaseLabel");
const timeElapsedEl = document.getElementById("timeElapsed");
const timeRemainingEl = document.getElementById("timeRemaining");
const progressFill = document.getElementById("progressFill");
const modeNameEl = document.getElementById("modeName");
const modeSwitch = document.getElementById("modeSwitch");

let currentMode = MODES.find((m) => m.id === DEFAULT_MODE_ID);
let sessionTotalMs = currentMode.durationMin * 60000;
let elapsedMs = 0;
let runStartTs = null; // performance.now() timestamp of last resume, or null when paused
let rafId = null;
let wakeLock = null;
let finishTimeout = null;

function formatTime(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getElapsed() {
  if (runStartTs === null) return elapsedMs;
  return elapsedMs + (performance.now() - runStartTs);
}

function setScale(scale) {
  circle.style.setProperty("--scale", scale.toFixed(4));
}

function updateTimeDisplay(elapsed) {
  const clamped = Math.min(elapsed, sessionTotalMs);
  timeElapsedEl.textContent = formatTime(clamped);
  timeRemainingEl.textContent = formatTime(sessionTotalMs - clamped);
  progressFill.style.width = `${((clamped / sessionTotalMs) * 100).toFixed(2)}%`;
}

function modeText(mode) {
  const m = T.modes[mode.id];
  return `${m.label} · ${m.detail}`;
}

function updateStaticDisplay() {
  modeNameEl.textContent = modeText(currentMode);
  phaseLabel.textContent = T.ready;
  circle.classList.remove("active");
  setScale(VMIN_REST);
  updateTimeDisplay(0);
}

function renderModeSwitch() {
  modeSwitch.innerHTML = "";
  MODES.forEach((mode) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mode-btn";
    btn.textContent = T.modes[mode.id].label;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", String(mode.id === currentMode.id));
    btn.addEventListener("click", () => selectMode(mode));
    modeSwitch.appendChild(btn);
  });
}

function selectMode(mode) {
  if (mode.id === currentMode.id) return;
  const wasInProgress = runStartTs !== null || elapsedMs > 0;

  clearTimeout(finishTimeout);
  cancelAnimationFrame(rafId);

  currentMode = mode;
  sessionTotalMs = mode.durationMin * 60000;
  elapsedMs = 0;
  runStartTs = null;

  modeNameEl.textContent = modeText(mode);
  [...modeSwitch.children].forEach((btn, i) => {
    btn.setAttribute("aria-selected", String(MODES[i].id === mode.id));
  });

  // Changer de mode en cours de séance quitte le programme actuel et
  // démarre directement le nouveau, plutôt que de continuer en silence.
  if (wasInProgress) {
    beginSession();
  } else {
    updateStaticDisplay();
  }
}

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch (err) {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && runStartTs !== null && !wakeLock) {
    requestWakeLock();
  }
});

function tick() {
  const elapsed = getElapsed();
  if (elapsed >= sessionTotalMs) {
    finishSession();
    return;
  }

  let scale;
  if (elapsed < WARMUP_MS) {
    // montée rapide du repos (10%) vers la taille mini (20%) au démarrage
    const t = elapsed / WARMUP_MS;
    scale = VMIN_REST + (VMIN_MIN - VMIN_REST) * easeOutCubic(t);
    phaseLabel.textContent = T.ready;
  } else {
    const breathElapsed = elapsed - WARMUP_MS;
    const periodMs = 60000 / currentMode.bpm;
    const phase = (breathElapsed % periodMs) / periodMs;
    scale = VMIN_MID + VMIN_AMP * Math.sin(2 * Math.PI * phase - Math.PI / 2);
    phaseLabel.textContent = phase < 0.5 ? T.inhale : T.exhale;
  }

  setScale(scale);
  updateTimeDisplay(elapsed);
  rafId = requestAnimationFrame(tick);
}

function beginSession() {
  clearTimeout(finishTimeout);
  circle.classList.add("active");
  runStartTs = performance.now();
  requestWakeLock();
  rafId = requestAnimationFrame(tick);
}

function pause() {
  elapsedMs = getElapsed();
  runStartTs = null;
  cancelAnimationFrame(rafId);
  phaseLabel.textContent = T.pause;
  updateTimeDisplay(elapsedMs);
  releaseWakeLock();
}

function toggleSession() {
  if (runStartTs !== null) {
    pause();
  } else {
    beginSession();
  }
}

function animateScale(from, to, duration, easing, onDone) {
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    setScale(from + (to - from) * easing(t));
    if (t < 1) {
      requestAnimationFrame(step);
    } else if (onDone) {
      onDone();
    }
  }
  requestAnimationFrame(step);
}

function settleToRest() {
  const from = parseFloat(circle.style.getPropertyValue("--scale")) || VMIN_MID;
  animateScale(from, VMIN_REST, SETTLE_MS, easeInOutCubic);
}

function finishSession() {
  cancelAnimationFrame(rafId);
  runStartTs = null;
  elapsedMs = 0;
  circle.classList.remove("active");
  releaseWakeLock();
  phaseLabel.textContent = T.finished;
  updateTimeDisplay(sessionTotalMs);
  settleToRest();
  finishTimeout = setTimeout(() => {
    phaseLabel.textContent = T.ready;
    updateTimeDisplay(0);
  }, 2200);
}

circle.addEventListener("click", toggleSession);
phaseLabel.addEventListener("click", toggleSession);
phaseLabel.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggleSession();
  }
});

let infoOpen = false;
function toggleInfo() {
  infoOpen = !infoOpen;
  stage.classList.toggle("info-open", infoOpen);
  titleToggle.setAttribute("aria-expanded", String(infoOpen));
}
titleToggle.addEventListener("click", toggleInfo);

function applyTranslations() {
  document.documentElement.lang = LOCALE;
  circle.setAttribute("aria-label", T.ariaCircle);
  titleToggle.setAttribute("aria-label", T.ariaTitle);
  modeSwitch.setAttribute("aria-label", T.ariaModes);
  infoPanel.textContent = T.info;
  const descMeta = document.querySelector('meta[name="description"]');
  if (descMeta) descMeta.setAttribute("content", T.description);
}

function setAppHeight() {
  // window.innerHeight reflète la vraie fenêtre visible, y compris en
  // mode standalone (app ajoutée à l'écran d'accueil), sans les
  // approximations des unités CSS de viewport sur iOS.
  document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
}

function updateStageInsets() {
  document.documentElement.style.setProperty("--reserved-top", `${header.offsetHeight}px`);
  document.documentElement.style.setProperty("--reserved-bottom", `${bottomUi.offsetHeight}px`);
}

setAppHeight();
window.addEventListener("resize", setAppHeight);
window.addEventListener("orientationchange", setAppHeight);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", setAppHeight);
}

// Le "stage" (zone de respiration) est borné à l'espace réellement
// disponible entre le header et l'UI du bas, mesuré en pixels, pour que
// le disque (plafonné à 500px) ne les chevauche jamais.
new ResizeObserver(updateStageInsets).observe(bottomUi);
window.addEventListener("resize", updateStageInsets);
updateStageInsets();

applyTranslations();
renderModeSwitch();
updateStaticDisplay();

// Apparition en douceur au chargement : le cercle grandit rapidement de
// rien jusqu'à sa taille de repos, plutôt que d'apparaître brutalement.
setScale(0);
circle.style.opacity = "0";
requestAnimationFrame(() => {
  animateScale(0, VMIN_REST, LOAD_GROW_MS, easeOutCubic);
  const start = performance.now();
  function fadeIn(now) {
    const t = Math.min(1, (now - start) / LOAD_GROW_MS);
    circle.style.opacity = String(0.5 * easeOutCubic(t));
    if (t < 1) {
      requestAnimationFrame(fadeIn);
    } else {
      circle.style.opacity = ""; // rend la main aux règles CSS (.active etc.)
    }
  }
  requestAnimationFrame(fadeIn);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// --- Diagnostic temporaire (?debug=1) ----------------------------------
// À retirer une fois le bug de mise en page iOS standalone confirmé résolu.
if (/[?&]debug=1/.test(location.search)) {
  const el = document.createElement("pre");
  el.id = "debugOverlay";
  el.style.cssText =
    "position:fixed;left:6px;bottom:6px;z-index:9999;background:rgba(0,0,0,0.8);" +
    "color:#7fd4ff;font:10px/1.45 monospace;padding:8px 10px;border-radius:8px;" +
    "pointer-events:none;white-space:pre;max-width:94vw;max-height:70vh;overflow:auto;";
  document.body.appendChild(el);
  function renderDebug() {
    const vv = window.visualViewport;
    const appRect = document.querySelector(".app").getBoundingClientRect();
    const bottomRect = bottomUi.getBoundingClientRect();
    const cs = getComputedStyle(document.documentElement);
    el.textContent = [
      `standalone: ${window.navigator.standalone}`,
      `innerHeight: ${window.innerHeight}`,
      `outerHeight: ${window.outerHeight}`,
      `screen.height: ${screen.height}`,
      `screen.availHeight: ${screen.availHeight}`,
      `docEl.clientHeight: ${document.documentElement.clientHeight}`,
      `body.clientHeight: ${document.body.clientHeight}`,
      `vv.height: ${vv ? vv.height : "n/a"}`,
      `vv.offsetTop: ${vv ? vv.offsetTop : "n/a"}`,
      `vv.scale: ${vv ? vv.scale : "n/a"}`,
      `dpr: ${window.devicePixelRatio}`,
      `--app-height: ${cs.getPropertyValue("--app-height")}`,
      `.app rect: top=${appRect.top} bottom=${appRect.bottom} h=${appRect.height}`,
      `.bottom-ui rect: top=${bottomRect.top} bottom=${bottomRect.bottom}`,
      `gap below bottom-ui: ${window.innerHeight - bottomRect.bottom}`,
    ].join("\n");
  }
  renderDebug();
  window.addEventListener("resize", renderDebug);
  setInterval(renderDebug, 1000);
}
