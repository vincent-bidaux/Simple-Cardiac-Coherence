// Simple Cardiac Coherence — respiration guidée par un cercle.

// --- i18n -------------------------------------------------------------
// L'app se sert dans la langue du navigateur : français par défaut,
// anglais pour toute autre langue (couverture large avec un texte
// vérifié plutôt que beaucoup de langues non relues).
const STRINGS = {
  fr: {
    ready: "Démarrer",
    inhale: "Inspire",
    hold: "Retiens",
    exhale: "Expire",
    pause: "Pause",
    finished: "Terminé",
    ariaCircle: "Démarrer ou mettre en pause la séance",
    ariaModes: "Choisir un mode de respiration",
    ariaTitle: "En savoir plus sur l'app",
    info: "La cohérence cardiaque est une technique de respiration lente et régulière qui synchronise votre rythme cardiaque pour réduire le stress. Choisissez un rythme en bas de l'écran, puis respirez en suivant le cercle : il grandit à l'inspiration, il se réduit à l'expiration.",
    description: "Cohérence cardiaque guidée : un cercle bleu clair grandit et se réduit selon 4 rythmes de respiration recommandés.",
    modes: {
      standard: { label: "Standard 365", detail: "6 resp/min · 5 min" },
      profond: { label: "Profond", detail: "4,5 resp/min · 5 min" },
      express: { label: "Express", detail: "6 resp/min · 3 min" },
      m478: { label: "4-7-8", detail: "Inspire 4 · Retiens 7 · Expire 8" },
    },
  },
  en: {
    ready: "Start",
    inhale: "Breathe in",
    hold: "Hold",
    exhale: "Breathe out",
    pause: "Paused",
    finished: "Done",
    ariaCircle: "Start or pause the session",
    ariaModes: "Choose a breathing mode",
    ariaTitle: "Learn more about the app",
    info: "Cardiac coherence is a slow, regular breathing technique that synchronizes your heart rate to reduce stress. Pick a rhythm at the bottom of the screen, then breathe along with the circle: it grows as you breathe in, and shrinks as you breathe out.",
    description: "Guided cardiac coherence: a light blue circle grows and shrinks following 4 recommended breathing rhythms.",
    modes: {
      standard: { label: "Standard 365", detail: "6 breaths/min · 5 min" },
      profond: { label: "Deep", detail: "4.5 breaths/min · 5 min" },
      express: { label: "Express", detail: "6 breaths/min · 3 min" },
      m478: { label: "4-7-8", detail: "Inhale 4 · Hold 7 · Exhale 8" },
    },
  },
};

function detectLocale() {
  const lang = (navigator.language || "fr").toLowerCase();
  return lang.startsWith("fr") ? "fr" : "en";
}

const LOCALE = detectLocale();
const T = STRINGS[LOCALE];

// 4 modes, chacun défini par une liste de phases (en secondes) plutôt
// qu'un simple rythme symétrique, pour couvrir aussi bien la cohérence
// cardiaque (inspire/expire égaux) que le 4-7-8 (inspire/retiens/expire
// de durées différentes) :
// - "365" (Dr David O'Hare) : 6 respirations/minute, 5 minutes, 3x/jour —
//   c'est LA référence en cohérence cardiaque, retenue ici par défaut.
// - la fréquence de résonance individuelle se situe généralement entre
//   4,5 et 7 resp/min : "Profond" couvre le bas de cette plage pour une
//   pratique plus avancée, "Express" garde le rythme de référence dans
//   un format court pour un reset rapide dans la journée.
// - "4-7-8" (Dr Andrew Weil, inspiré du pranayama) : inspire 4s, retiens
//   le souffle 7s, expire 8s — une technique différente de la cohérence
//   cardiaque (respiration bloquée, pas de rythme cardiaque cible), mais
//   qui se prête bien au même diagramme, avec une phase de rétention en
//   plus. Utilisée pour s'endormir ; à ne pas confondre avec la
//   "méthode militaire" (surtout de la relaxation/visualisation, pas de
//   la respiration).
function symmetricPhases(bpm) {
  const half = 60 / bpm / 2;
  return [
    { type: "inhale", s: half },
    { type: "exhale", s: half },
  ];
}

const MODES = [
  { id: "standard", durationMin: 5, phases: symmetricPhases(6) },
  { id: "profond", durationMin: 5, phases: symmetricPhases(4.5) },
  { id: "express", durationMin: 3, phases: symmetricPhases(6) },
  {
    id: "m478",
    durationMin: 4,
    phases: [
      { type: "inhale", s: 4 },
      { type: "hold", s: 7 },
      { type: "exhale", s: 8 },
    ],
  },
];

const DEFAULT_MODE_ID = "standard";

// Tailles exprimées en fraction de vmin/cqmin (le cercle a une boîte de
// base de 100%, transform:scale() représente donc directement cette
// fraction).
const VMIN_REST = 0.14; // au lancement de l'app / après la fin d'un programme
const VMIN_MIN = 0.2; // taille mini pendant la respiration
const VMIN_MAX = 0.9; // taille maxi (= le contour de référence)
const VMIN_MID = (VMIN_MIN + VMIN_MAX) / 2; // repli du settle-to-rest
const WARMUP_MS = 260; // montée rapide de repos -> taille mini au démarrage
const SETTLE_MS = 450; // redescente en douceur vers le repos à la fin
const LOAD_GROW_MS = 500; // apparition en douceur au chargement de la page

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

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

// Découpe un cycle en phases de durées quelconques (inspire/retiens/
// expire) et renvoie dans laquelle on se trouve à un instant donné, avec
// la progression (0-1) à l'intérieur de cette phase. Généralise aussi
// bien un cycle symétrique (cohérence cardiaque) qu'un cycle à 3 temps
// inégaux avec rétention (4-7-8).
function currentPhase(elapsedInPeriodMs, phases) {
  let acc = 0;
  for (const p of phases) {
    const durMs = p.s * 1000;
    if (elapsedInPeriodMs < acc + durMs) {
      return { type: p.type, t: (elapsedInPeriodMs - acc) / durMs };
    }
    acc += durMs;
  }
  return { type: phases[phases.length - 1].type, t: 1 };
}

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
    const periodMs = currentMode.phases.reduce((sum, p) => sum + p.s, 0) * 1000;
    const { type, t } = currentPhase(breathElapsed % periodMs, currentMode.phases);
    const eased = easeInOutCubic(t);
    if (type === "inhale") {
      scale = VMIN_MIN + (VMIN_MAX - VMIN_MIN) * eased;
      phaseLabel.textContent = T.inhale;
    } else if (type === "hold") {
      scale = VMIN_MAX;
      phaseLabel.textContent = T.hold;
    } else {
      scale = VMIN_MAX - (VMIN_MAX - VMIN_MIN) * eased;
      phaseLabel.textContent = T.exhale;
    }
  }

  setScale(scale);
  updateTimeDisplay(elapsed);
  rafId = requestAnimationFrame(tick);
}

// --- Sons doux de début/fin de séance -----------------------------------
// Générés en Web Audio (pas de fichier audio à héberger), volume bas,
// enveloppe douce pour rester discrets.
let audioCtx = null;
function getAudioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

function playTone(freq, duration, delay, peakGain) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + delay;
  gain.gain.setValueAtTime(0, t0);
  // attaque lente (0.18s) : évite tout "clic", donne un son rond plutôt
  // qu'un ping. La fréquence basse (registre grave/médium) fait le reste
  // pour un timbre calme plutôt que cristallin.
  gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.18);
  gain.gain.linearRampToValueAtTime(0, t0 + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function playStartChime() {
  playTone(196.0, 0.9, 0, 0.14); // G3
  playTone(261.63, 1.0, 0.2, 0.11); // C4
}

function playEndChime() {
  playTone(261.63, 0.85, 0, 0.12); // C4
  playTone(196.0, 1.0, 0.22, 0.1); // G3, résolution descendante
}

// --- Vibration douce (Android/Chrome uniquement) -------------------------
// navigator.vibrate() n'a jamais été implémenté par Apple : sur iPhone
// (Safari, y compris en PWA installée), cet appel est un no-op silencieux,
// quelle que soit l'autorisation — ce n'est pas une histoire de
// permission, l'API est absente de WebKit. Là où elle existe, aucune
// autorisation n'est demandée : l'appel fonctionne directement.
function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function beginSession() {
  clearTimeout(finishTimeout);
  if (elapsedMs === 0) {
    playStartChime();
    vibrate(30);
  }
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
  playEndChime();
  vibrate([40, 90, 40]);
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

function applyTranslations() {
  document.documentElement.lang = LOCALE;
  circle.setAttribute("aria-label", T.ariaCircle);
  titleToggle.setAttribute("aria-label", T.ariaTitle);
  modeSwitch.setAttribute("aria-label", T.ariaModes);
  infoPanel.textContent = T.info;
  const descMeta = document.querySelector('meta[name="description"]');
  if (descMeta) descMeta.setAttribute("content", T.description);
}

// En mode standalone iOS, dvh/innerHeight peuvent sous-évaluer la vraie
// hauteur d'écran disponible (confirmé sur appareil : innerHeight=793 vs
// screen.height=852, un écart de 59px qui laissait exactement ce vide
// sous l'UI du bas). screen.height/screen.width sont eux fiables. En
// navigateur normal (pas standalone), on ne touche à rien : innerHeight
// y exclut correctement la barre d'outils du navigateur, et utiliser
// screen.height ferait déborder le contenu derrière elle.
function setAppHeight() {
  if (window.navigator.standalone) {
    const h = window.innerHeight >= window.innerWidth ? screen.height : screen.width;
    document.documentElement.style.setProperty("--app-height", `${h}px`);
  } else {
    document.documentElement.style.removeProperty("--app-height");
  }
}
setAppHeight();
window.addEventListener("resize", setAppHeight);
window.addEventListener("orientationchange", setAppHeight);

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

// --- Diagnostic temporaire ----------------------------------------------
// À retirer une fois le bug de mise en page iOS standalone confirmé résolu.
//
// Une app standalone (ajoutée à l'écran d'accueil) tourne dans un
// contexte qui ne partage pas forcément le localStorage/les query params
// de Safari, donc ?debug=1 seul ne suffit pas à l'atteindre depuis
// l'icône installée. Un appui long (800ms) sur le titre, en haut, marche
// dans les deux cas puisqu'il ne dépend d'aucun état partagé.
let debugInterval = null;
function renderDebug(el) {
  const vv = window.visualViewport;
  const appRect = document.querySelector(".app").getBoundingClientRect();
  const bottomRect = bottomUi.getBoundingClientRect();
  const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
  const appHeightVar = getComputedStyle(document.documentElement).getPropertyValue("--app-height");
  el.textContent = [
    `build: flexbox + screen.height override on standalone`,
    `--app-height: ${appHeightVar || "(unset, using dvh)"}`,
    `sw controller: ${sw ? sw.scriptURL : "none"}`,
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
    `.app rect: top=${appRect.top} bottom=${appRect.bottom} h=${appRect.height}`,
    `.bottom-ui rect: top=${bottomRect.top} bottom=${bottomRect.bottom}`,
    `gap below bottom-ui: ${window.innerHeight - bottomRect.bottom}`,
  ].join("\n");
}

function createDebugOverlay() {
  if (document.getElementById("debugOverlay")) return;
  const el = document.createElement("pre");
  el.id = "debugOverlay";
  el.style.cssText =
    "position:fixed;left:6px;bottom:6px;z-index:9999;background:rgba(0,0,0,0.85);" +
    "color:#7fd4ff;font:10px/1.45 monospace;padding:8px 10px;border-radius:8px;" +
    "pointer-events:none;white-space:pre;max-width:94vw;max-height:70vh;overflow:auto;";
  document.body.appendChild(el);
  renderDebug(el);
  debugInterval = setInterval(() => renderDebug(el), 1000);
  localStorage.setItem("scc_debug", "1");
}

function removeDebugOverlay() {
  const el = document.getElementById("debugOverlay");
  if (el) el.remove();
  if (debugInterval) {
    clearInterval(debugInterval);
    debugInterval = null;
  }
  localStorage.removeItem("scc_debug");
}

function toggleDebugOverlay() {
  if (document.getElementById("debugOverlay")) removeDebugOverlay();
  else createDebugOverlay();
}

let titlePressTimer = null;
let titleLongPressed = false;
titleToggle.addEventListener("pointerdown", () => {
  titleLongPressed = false;
  titlePressTimer = setTimeout(() => {
    titleLongPressed = true;
    toggleDebugOverlay();
  }, 800);
});
["pointerup", "pointercancel", "pointerleave"].forEach((evt) => {
  titleToggle.addEventListener(evt, () => clearTimeout(titlePressTimer));
});
titleToggle.addEventListener("click", () => {
  if (titleLongPressed) return; // l'appui long a déjà géré ce tap
  toggleInfo();
});

if (/[?&]debug=1/.test(location.search) || localStorage.getItem("scc_debug") === "1") {
  createDebugOverlay();
} else if (/[?&]debug=0/.test(location.search)) {
  localStorage.removeItem("scc_debug");
}
