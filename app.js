// Simple Cardiac Coherence — respiration guidée par un cercle.
//
// 3 modes = 3 couples (rythme, durée) parmi les plus recommandés en
// cohérence cardiaque :
// - "365" (Dr David O'Hare) : 6 respirations/minute, 5 minutes, 3x/jour —
//   c'est LA référence, retenue ici comme mode par défaut.
// - la fréquence de résonance individuelle se situe généralement entre
//   4,5 et 7 resp/min : "Profond" couvre le bas de cette plage pour une
//   pratique plus avancée, "Express" garde le rythme de référence dans
//   un format court pour un reset rapide dans la journée.
const MODES = [
  {
    id: "standard",
    label: "Standard 365",
    bpm: 6,
    durationMin: 5,
    detail: "6 resp/min · 5 min",
  },
  {
    id: "profond",
    label: "Profond",
    bpm: 4.5,
    durationMin: 5,
    detail: "4,5 resp/min · 5 min",
  },
  {
    id: "express",
    label: "Express",
    bpm: 6,
    durationMin: 3,
    detail: "6 resp/min · 3 min",
  },
];

const DEFAULT_MODE_ID = "standard";

// Tailles exprimées en fraction de vmin (le cercle a une boîte de base de
// 100vmin, transform:scale() représente donc directement cette fraction).
const VMIN_REST = 0.1; // au lancement de l'app / après la fin d'un programme
const VMIN_MIN = 0.2; // taille mini pendant la respiration
const VMIN_MAX = 0.9; // taille maxi (= le contour de référence)
const VMIN_MID = (VMIN_MIN + VMIN_MAX) / 2;
const VMIN_AMP = (VMIN_MAX - VMIN_MIN) / 2;
const WARMUP_MS = 260; // montée rapide de repos -> taille mini au démarrage
const SETTLE_MS = 450; // redescente en douceur vers le repos à la fin

const header = document.querySelector(".header");
const bottomUi = document.querySelector(".bottom-ui");
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

function updateStaticDisplay() {
  modeNameEl.textContent = `${currentMode.label} · ${currentMode.detail}`;
  phaseLabel.textContent = "Prêt";
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
    btn.textContent = mode.label;
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

  modeNameEl.textContent = `${mode.label} · ${mode.detail}`;
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
    const eased = 1 - Math.pow(1 - t, 3);
    scale = VMIN_REST + (VMIN_MIN - VMIN_REST) * eased;
    phaseLabel.textContent = "Prêt";
  } else {
    const breathElapsed = elapsed - WARMUP_MS;
    const periodMs = 60000 / currentMode.bpm;
    const phase = (breathElapsed % periodMs) / periodMs;
    scale = VMIN_MID + VMIN_AMP * Math.sin(2 * Math.PI * phase - Math.PI / 2);
    phaseLabel.textContent = phase < 0.5 ? "Inspire" : "Expire";
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
  phaseLabel.textContent = "Pause";
  updateTimeDisplay(elapsedMs);
  releaseWakeLock();
}

function settleToRest() {
  const start = performance.now();
  const from = parseFloat(circle.style.getPropertyValue("--scale")) || VMIN_MID;
  function step(now) {
    const t = Math.min(1, (now - start) / SETTLE_MS);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    setScale(from + (VMIN_REST - from) * eased);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function finishSession() {
  cancelAnimationFrame(rafId);
  runStartTs = null;
  elapsedMs = 0;
  circle.classList.remove("active");
  releaseWakeLock();
  phaseLabel.textContent = "Terminé";
  updateTimeDisplay(sessionTotalMs);
  settleToRest();
  finishTimeout = setTimeout(() => {
    phaseLabel.textContent = "Prêt";
    updateTimeDisplay(0);
  }, 2200);
}

circle.addEventListener("click", () => {
  if (runStartTs !== null) {
    pause();
  } else {
    beginSession();
  }
});

function updateStageInsets() {
  document.documentElement.style.setProperty("--reserved-top", `${header.offsetHeight}px`);
  document.documentElement.style.setProperty("--reserved-bottom", `${bottomUi.offsetHeight}px`);
}

// Le "stage" (zone de respiration) est borné à l'espace réellement
// disponible entre le header et l'UI du bas, mesuré en pixels, pour que
// le disque (plafonné à 500px) ne les chevauche jamais.
new ResizeObserver(updateStageInsets).observe(bottomUi);
window.addEventListener("resize", updateStageInsets);
updateStageInsets();

renderModeSwitch();
updateStaticDisplay();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
