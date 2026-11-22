/* cozy pomodoro — all the little ticks and moods */

const SCENES = [
  { id: "midnight-mint", name: "Midnight Mint", swatch: "#86e6bd", hint: "cool, quiet, focused" },
  { id: "honey-lamp", name: "Honey Lamp", swatch: "#ffc879", hint: "warm and golden" },
  { id: "rainy-window", name: "Rainy Window", swatch: "#9ed8f5", hint: "soft blue stillness" },
  { id: "cocoa-evening", name: "Cocoa Evening", swatch: "#e6b48d", hint: "slow and chocolatey" },
  { id: "matcha-cloud", name: "Matcha Cloud", swatch: "#4e9a70", hint: "light and fresh" },
  { id: "rose-steam", name: "Rose Steam", swatch: "#c76f84", hint: "gentle and rosy" },
  { id: "cairo-dusk", name: "Cairo Dusk", swatch: "#efc979", hint: "desert gold at night" },
  { id: "lavender-haze", name: "Lavender Haze", swatch: "#8569c4", hint: "dreamy and calm" },
];

const MODE_LABELS = {
  focus: "time to focus",
  short: "a little rest",
  long: "long, slow break",
};

const STORE_KEY = "cozy-pomodoro-v1";
const CIRCUMFERENCE = 2 * Math.PI * 122;

const el = {
  body: document.body,
  sceneList: document.getElementById("scene-list"),
  sceneHint: document.getElementById("scene-hint"),
  modes: [...document.querySelectorAll(".mode")],
  time: document.getElementById("time"),
  timerLabel: document.getElementById("timer-label"),
  ring: document.getElementById("ring-progress"),
  start: document.getElementById("start-btn"),
  reset: document.getElementById("reset-btn"),
  skip: document.getElementById("skip-btn"),
  task: document.getElementById("task-input"),
  pips: document.getElementById("pips"),
  toast: document.getElementById("toast"),
  backdrop: document.getElementById("sheet-backdrop"),
  settingsBtn: document.getElementById("settings-btn"),
  closeSettings: document.getElementById("close-settings"),
  saveSettings: document.getElementById("save-settings"),
  focusMin: document.getElementById("focus-min"),
  shortMin: document.getElementById("short-min"),
  longMin: document.getElementById("long-min"),
};

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
  catch { return {}; }
}

const saved = load();
const state = {
  scene: SCENES.some(s => s.id === saved.scene) ? saved.scene : SCENES[0].id,
  durations: {
    focus: clamp(saved.durations?.focus, 25, 1, 120) * 60,
    short: clamp(saved.durations?.short, 5, 1, 60) * 60,
    long: clamp(saved.durations?.long, 15, 1, 90) * 60,
  },
  completed: Math.max(0, saved.completed || 0),
  mode: "focus",
  remaining: 25 * 60,
  running: false,
  endAt: 0,
  ticker: null,
  audio: null,
};

function clamp(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      scene: state.scene,
      completed: state.completed,
      durations: {
        focus: state.durations.focus / 60,
        short: state.durations.short / 60,
        long: state.durations.long / 60,
      },
    }));
  } catch { /* private mode, no big deal */ }
}

/* ---------- scenes ---------- */

function buildScenes() {
  el.sceneList.innerHTML = "";
  SCENES.forEach(scene => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "scene-chip";
    chip.dataset.scene = scene.id;
    chip.style.setProperty("--swatch", scene.swatch);
    chip.innerHTML = `<span class="scene-dot" aria-hidden="true"></span>${scene.name}`;
    chip.addEventListener("click", () => setScene(scene.id));
    el.sceneList.appendChild(chip);
  });
}

function setScene(id) {
  const scene = SCENES.find(s => s.id === id);
  if (!scene) return;
  state.scene = id;
  el.body.dataset.scene = id;
  el.sceneHint.textContent = scene.hint;
  [...el.sceneList.children].forEach(chip => {
    const active = chip.dataset.scene === id;
    chip.classList.toggle("active", active);
    chip.setAttribute("aria-pressed", String(active));
  });
  persist();
}

/* ---------- timer ---------- */

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function render() {
  const time = formatTime(state.remaining);
  el.time.textContent = time;
  el.timerLabel.textContent = MODE_LABELS[state.mode];
  el.ring.style.strokeDasharray = CIRCUMFERENCE;
  el.ring.style.strokeDashoffset = CIRCUMFERENCE * (1 - state.remaining / state.durations[state.mode]);

  const verb = state.running ? "pause" : (state.remaining < state.durations[state.mode] ? "resume" : "start");
  const what = state.mode === "focus" ? "focus" : "break";
  el.start.innerHTML = `${verb} ${what} <span aria-hidden="true">${state.running ? "❚❚" : "→"}</span>`;

  el.modes.forEach(button => {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });

  const filled = state.completed % 4 || (state.completed ? 4 : 0);
  [...el.pips.children].forEach((pip, i) => pip.classList.toggle("done", i < filled));

  document.title = `${time} · ${state.mode === "focus" ? "focus" : "break"} — cozy pomodoro`;
}

function tick() {
  state.remaining = Math.max(0, (state.endAt - Date.now()) / 1000);
  if (state.remaining <= 0) finish();
  else render();
}

function start() {
  if (state.running) return;
  unlockAudio();
  state.endAt = Date.now() + state.remaining * 1000;
  state.running = true;
  state.ticker = setInterval(tick, 250);
  render();
}

function pause() {
  if (!state.running) return;
  state.remaining = Math.max(0, (state.endAt - Date.now()) / 1000);
  state.running = false;
  clearInterval(state.ticker);
  state.ticker = null;
  render();
}

function toggle() { state.running ? pause() : start(); }

function stop() {
  state.running = false;
  clearInterval(state.ticker);
  state.ticker = null;
}

function setMode(mode) {
  stop();
  state.mode = mode;
  state.remaining = state.durations[mode];
  render();
}

function finish(countSession = true) {
  const wasFocus = state.mode === "focus";
  let next = "focus";
  if (wasFocus) {
    if (countSession) {
      state.completed += 1;
      persist();
      next = state.completed % 4 === 0 ? "long" : "short";
    } else {
      next = "short";
    }
  }
  chime(wasFocus);
  setMode(next);
  showToast(wasFocus ? "nice work — take a breath ☕" : "break over, ready when you are");
}

function skip() { finish(false); }

/* ---------- tiny sounds (no audio files needed) ---------- */

function unlockAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!state.audio) state.audio = new Ctx();
    if (state.audio.state === "suspended") state.audio.resume();
  } catch { /* audio is optional */ }
}

function chime(isFocus) {
  if (!state.audio) return;
  const notes = isFocus ? [523.25, 659.25, 783.99] : [659.25, 523.25];
  notes.forEach((freq, i) => {
    const osc = state.audio.createOscillator();
    const gain = state.audio.createGain();
    const t = state.audio.currentTime + i * 0.13;
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    osc.connect(gain).connect(state.audio.destination);
    osc.start(t);
    osc.stop(t + 0.7);
  });
}

/* ---------- misc ui ---------- */

let toastTimer;
function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("show"), 3200);
}

function openSettings() {
  el.focusMin.value = state.durations.focus / 60;
  el.shortMin.value = state.durations.short / 60;
  el.longMin.value = state.durations.long / 60;
  el.backdrop.hidden = false;
  el.focusMin.focus();
}

function closeSettings() { el.backdrop.hidden = true; }

function saveSettings() {
  state.durations.focus = clamp(el.focusMin.value, 25, 1, 120) * 60;
  state.durations.short = clamp(el.shortMin.value, 5, 1, 60) * 60;
  state.durations.long = clamp(el.longMin.value, 15, 1, 90) * 60;
  setMode(state.mode);
  persist();
  closeSettings();
  showToast("settings saved ✨");
}

/* ---------- wire it up ---------- */

buildScenes();
setScene(state.scene);
el.task.value = saved.task || "";
state.remaining = state.durations.focus;
for (let i = 0; i < 4; i++) {
  const pip = document.createElement("span");
  pip.className = "pip";
  el.pips.appendChild(pip);
}
render();

el.start.addEventListener("click", toggle);
el.reset.addEventListener("click", () => { setMode(state.mode); showToast("fresh start"); });
el.skip.addEventListener("click", skip);
el.modes.forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));
el.task.addEventListener("input", () => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...load(), task: el.task.value })); }
  catch { /* ignore */ }
});

el.settingsBtn.addEventListener("click", openSettings);
el.closeSettings.addEventListener("click", closeSettings);
el.saveSettings.addEventListener("click", saveSettings);
el.backdrop.addEventListener("click", event => { if (event.target === el.backdrop) closeSettings(); });

document.addEventListener("keydown", event => {
  if (event.target.matches("input") || !el.backdrop.hidden) return;
  if (event.code === "Space") { event.preventDefault(); toggle(); }
  if (event.key.toLowerCase() === "r") { setMode(state.mode); showToast("fresh start"); }
});
