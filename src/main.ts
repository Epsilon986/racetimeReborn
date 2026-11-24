import './style.css';
import trackData from './data/farm-river.json';
import { Track } from './game/track.ts';
import { Ghost, SIM_VERSION, STEP, formatTime, initialState, stepRace, type InputEvent, type Replay } from './game/simulation.ts';
import { RaceRenderer } from './game/renderer.ts';
import { readBest, saveBest } from './game/storage.ts';

const pauseIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
const playIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 10 7-10 7Z"/></svg>';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="game" aria-label="Race Time">
    <div id="track-view"></div>
    <div class="hud">
      <span id="lap" class="lap" aria-label="Lap 1 of 2">1 / 2</span>
      <span id="timer" class="timer" aria-label="Race time">00:00.00</span>
      <div class="toolbar">
        <button id="restart" class="quiet-button" title="Restart (R)">Restart</button>
        <button id="pause" class="icon-button" aria-label="Pause race" title="Pause (P)" disabled>${pauseIcon}</button>
        <button id="menu" class="icon-button" aria-label="Settings" title="Settings"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg></button>
      </div>
    </div>
    <div id="overlay" class="overlay">
      <section class="message"><h1>Race Time</h1><p>Hold to go. Release to turn.</p><button id="start" class="primary-button">Race</button></section>
    </div>
    <button id="accelerator" class="accelerator" aria-label="Hold to accelerate; release to turn" aria-pressed="false">Hold to accelerate</button>
    <span id="announcement" class="sr-only" role="status" aria-live="polite"></span>
  </main>
  <dialog id="settings">
    <form method="dialog">
      <h2>Farm River</h2>
      <p class="best-line">Best <span id="best-time">--:--.--</span></p>
      <label class="setting-row" for="ghost-toggle">Ghost<input id="ghost-toggle" type="checkbox" checked><span class="switch" aria-hidden="true"></span></label>
      <label class="setting-row" for="sound-toggle">Sound<input id="sound-toggle" type="checkbox"><span class="switch" aria-hidden="true"></span></label>
      <button id="fullscreen" type="button" class="text-button">Fullscreen</button>
      <p class="keyboard-hint">Space to go · R to restart · P to pause</p>
      <button class="primary-button">Close</button>
    </form>
  </dialog>
`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const track = new Track(trackData);
const renderer = new RaceRenderer(el('track-view'), track);
let state = initialState();
let best = readBest(track.data.id);
let ghost = best ? new Ghost(best) : null;
let ghostVisible = true;
type Phase = 'ready' | 'countdown' | 'racing' | 'paused' | 'finished';
let phase: Phase = 'ready';
let pausedFrom: 'countdown' | 'racing' = 'racing';
let resumeAfterMenu = false;
let countdown = 2;
let lastCountdown = 2;
let accumulator = 0;
let events: InputEvent[] = [];
let recordedHeld = false;
const keys = new Set<string>();
const pointers = new Set<number>();
let sound = false;
let audio: AudioContext | null = null;
let lastTime = performance.now();
let previousContact = 0;
const held = () => keys.size > 0 || pointers.size > 0;
const settings = el<HTMLDialogElement>('settings');
const accelerator = el<HTMLButtonElement>('accelerator');
const pauseButton = el<HTMLButtonElement>('pause');

function beep(frequency = 500, duration = .07, volume = .045) {
  if (!sound) return;
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + duration);
  } catch { /* Audio is optional. */ }
}

function showOverlay(markup: string) {
  el('overlay').innerHTML = markup;
  el('overlay').hidden = !markup;
}

function updateBest() {
  el('best-time').textContent = best ? formatTime(best.ticks * STEP) : '--:--.--';
  el<HTMLInputElement>('ghost-toggle').disabled = !best;
}
updateBest();

function startRace(quick = false) {
  if (phase === 'countdown' || phase === 'racing') return;
  state = initialState(); events = []; recordedHeld = false; accumulator = 0; previousContact = 0;
  renderer.resetFollow(state);
  ghost = best ? new Ghost(best) : null;
  countdown = quick ? .75 : 2;
  lastCountdown = Math.ceil(countdown);
  phase = 'countdown';
  pauseButton.disabled = false;
  pauseButton.innerHTML = pauseIcon;
  pauseButton.setAttribute('aria-label', 'Pause race');
  showOverlay(`<div class="countdown-number" aria-hidden="true">${lastCountdown}</div>`);
  el('announcement').textContent = 'Get ready';
  beep(440);
}

function clearInput() { keys.clear(); pointers.clear(); }

function restartRace() {
  clearInput(); phase = 'ready'; startRace(true);
}

function pauseRace() {
  if (phase !== 'racing' && phase !== 'countdown') return;
  pausedFrom = phase; phase = 'paused'; clearInput(); accumulator = 0;
  pauseButton.innerHTML = playIcon;
  pauseButton.setAttribute('aria-label', 'Resume race');
  showOverlay('<section class="message"><h2>Paused</h2><button class="primary-button" data-action="resume">Resume</button></section>');
  el('announcement').textContent = 'Race paused';
}

function resumeRace() {
  if (phase !== 'paused') return;
  phase = pausedFrom; lastTime = performance.now(); accumulator = 0;
  pauseButton.innerHTML = pauseIcon;
  pauseButton.setAttribute('aria-label', 'Pause race');
  showOverlay(phase === 'countdown' ? `<div class="countdown-number" aria-hidden="true">${Math.ceil(countdown)}</div>` : '');
  el('announcement').textContent = 'Race resumed';
}

function finishRace() {
  phase = 'finished'; clearInput();
  const newBest = !best || state.tick < best.ticks;
  let saved = true;
  if (newBest) {
    const replay: Replay = { version: SIM_VERSION, trackId: track.data.id, ticks: state.tick, events: events.map(e => ({ ...e })), createdAt: new Date().toISOString() };
    saved = saveBest(replay); best = replay; updateBest();
  }
  const time = formatTime(state.tick * STEP);
  showOverlay(`<section class="message finish-message"><p>${newBest ? 'New best' : 'Finish'}</p><h2>${time}</h2>${!newBest && best ? `<p>Best ${formatTime(best.ticks * STEP)}</p>` : ''}<button class="primary-button" data-action="restart">Again</button>${!saved ? '<p class="storage-note">Best kept for this session.</p>' : ''}</section>`);
  pauseButton.disabled = true;
  el('announcement').textContent = `${newBest ? 'New best' : 'Finished'}: ${time}`;
  beep(newBest ? 880 : 660, .22);
}

el('start').addEventListener('click', () => startRace());
el('overlay').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (button?.dataset.action === 'resume') resumeRace();
  if (button?.dataset.action === 'restart') restartRace();
});
el('restart').addEventListener('click', () => { el('restart').blur(); restartRace(); });
pauseButton.addEventListener('click', () => { pauseButton.blur(); phase === 'paused' ? resumeRace() : pauseRace(); });
el<HTMLInputElement>('ghost-toggle').addEventListener('change', e => { ghostVisible = (e.target as HTMLInputElement).checked; });
el<HTMLInputElement>('sound-toggle').addEventListener('change', e => { sound = (e.target as HTMLInputElement).checked; beep(660); });
el('menu').addEventListener('click', () => {
  resumeAfterMenu = phase === 'racing' || phase === 'countdown';
  pauseRace(); clearInput(); settings.showModal();
});
settings.addEventListener('close', () => {
  el('menu').blur();
  if (resumeAfterMenu && !document.hidden) resumeRace();
  resumeAfterMenu = false;
});
el('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { el('fullscreen').textContent = 'Fullscreen unavailable'; }
});
document.addEventListener('fullscreenchange', () => { el('fullscreen').textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'; });

for (const target of [accelerator, el('track-view')]) {
  target.addEventListener('pointerdown', event => {
    if (event.button !== 0 || phase === 'paused' || settings.open) return;
    event.preventDefault();
    target.setPointerCapture(event.pointerId); pointers.add(event.pointerId);
    if (phase === 'ready' || phase === 'finished') startRace();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    target.addEventListener(name, event => pointers.delete((event as PointerEvent).pointerId));
  }
}

const driveKeys = new Set(['Space', 'KeyW', 'ArrowUp']);
window.addEventListener('keydown', event => {
  if (settings.open || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)) return;
  const target = event.target as HTMLElement;
  const nativeButton = target.tagName === 'BUTTON' && target !== accelerator;
  if ((driveKeys.has(event.code) || event.code === 'Enter' && target === accelerator) && !(nativeButton && event.code === 'Space')) {
    event.preventDefault();
    if (event.repeat) return;
    if (phase === 'paused') { resumeRace(); return; }
    keys.add(event.code);
    if (phase === 'ready' || phase === 'finished') startRace();
  } else if (event.code === 'KeyR' && !event.repeat) restartRace();
  else if ((event.code === 'KeyP' || event.code === 'Escape') && !event.repeat) {
    if (phase === 'paused') resumeRace(); else pauseRace();
  }
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => { clearInput(); pauseRace(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); pauseRace(); } });

let displayedLap = 0;
function frame(now: number) {
  const dt = Math.min((now - lastTime) / 1000, .1); lastTime = now;
  if (phase === 'countdown') {
    countdown -= dt;
    const number = Math.ceil(countdown);
    if (number !== lastCountdown && number > 0) {
      lastCountdown = number; showOverlay(`<div class="countdown-number" aria-hidden="true">${number}</div>`); beep(440);
    }
    if (countdown <= 0) {
      phase = 'racing'; accumulator = 0; showOverlay(''); beep(880, .15);
      el('announcement').textContent = 'Go';
    }
  }
  if (phase === 'racing') {
    accumulator += dt;
    while (accumulator >= STEP && phase === 'racing') {
      const input = held();
      if (input !== recordedHeld) { events.push({ tick: state.tick, held: input }); recordedHeld = input; }
      stepRace(track, state, input); ghost?.step(track); accumulator -= STEP;
      if (state.contacts > previousContact) { previousContact = state.contacts; beep(140, .05, .025); }
      if (state.finished) finishRace();
    }
  }
  const active = held() && (phase === 'racing' || phase === 'countdown');
  accelerator.classList.toggle('pressed', active);
  accelerator.setAttribute('aria-pressed', String(active));
  el('timer').textContent = formatTime(state.tick * STEP);
  const lap = state.progress >= track.count ? 2 : 1;
  if (lap !== displayedLap) {
    displayedLap = lap;
    el('lap').textContent = `${lap} / 2`;
    el('lap').setAttribute('aria-label', `Lap ${lap} of 2`);
  }
  renderer.draw({ player: state, ghost: ghost?.state ?? null, ghostVisible, held: held(), racing: phase === 'racing' }, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
