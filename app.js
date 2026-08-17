// Simple Cardiac Coherence — respiration guidée par un cercle.
//
// 4 modes = 4 couples (rythme, durée) parmi les plus recommandés en
// cohérence cardiaque :
// - "365" (Dr David O'Hare) : 6 respirations/minute, 5 minutes, 3x/jour —
//   c'est LA référence, retenue ici comme mode par défaut.
// - la fréquence de résonance individuelle se situe généralement entre
//   4,5 et 7 resp/min : on couvre cette plage avec un mode plus lent
//   (Profond) et un mode plus rapide (Découverte, plus facile à tenir
//   pour débuter) plus un format court (Express) pour un reset rapide.
const MODES = [
  {
    id: "decouverte",
    label: "Découverte",
    bpm: 7,
    durationMin: 5,
    detail: "7 resp/min · 5 min",
  },
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
const MIN_SCALE = 0.62;
const MAX_SCALE = 1.0;
const SCALE_MID = (MIN_SCALE + MAX_SCALE) / 2;
const SCALE_AMP = (MAX_SCALE - MIN_SCALE) / 2;

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
  setScale(MIN_SCALE);
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
  if (mode.id === currentMode.id && runStartTs === null && elapsedMs === 0) return;
  currentMode = mode;
  sessionTotalMs = mode.durationMin * 60000;
  elapsedMs = 0;
  const wasRunning = runStartTs !== null;
  if (wasRunning) {
    runStartTs = performance.now();
  } else {
    updateStaticDisplay();
  }
  [...modeSwitch.children].forEach((btn, i) => {
    btn.setAttribute("aria-selected", String(MODES[i].id === mode.id));
  });
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
  const periodMs = 60000 / currentMode.bpm;
  const phase = (elapsed % periodMs) / periodMs;
  const scale = SCALE_MID + SCALE_AMP * Math.sin(2 * Math.PI * phase - Math.PI / 2);
  setScale(scale);
  phaseLabel.textContent = phase < 0.5 ? "Inspire" : "Expire";
  updateTimeDisplay(elapsed);
  rafId = requestAnimationFrame(tick);
}

function resume() {
  clearTimeout(finishTimeout);
  if (elapsedMs >= sessionTotalMs) elapsedMs = 0;
  runStartTs = performance.now();
  circle.classList.add("running");
  requestWakeLock();
  rafId = requestAnimationFrame(tick);
}

function pause() {
  elapsedMs = getElapsed();
  runStartTs = null;
  cancelAnimationFrame(rafId);
  circle.classList.remove("running");
  phaseLabel.textContent = "Pause";
  updateTimeDisplay(elapsedMs);
  releaseWakeLock();
}

function finishSession() {
  cancelAnimationFrame(rafId);
  runStartTs = null;
  elapsedMs = 0;
  circle.classList.remove("running");
  releaseWakeLock();
  setScale(MIN_SCALE);
  phaseLabel.textContent = "Terminé";
  updateTimeDisplay(sessionTotalMs);
  finishTimeout = setTimeout(() => {
    phaseLabel.textContent = "Prêt";
    updateTimeDisplay(0);
  }, 2200);
}

circle.addEventListener("click", () => {
  if (runStartTs !== null) {
    pause();
  } else {
    resume();
  }
});

renderModeSwitch();
updateStaticDisplay();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
