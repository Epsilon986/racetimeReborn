import './style.css';
import trackData from './data/farm-river.json';
import { Track } from './game/track.ts';
import { Ghost, SIM_VERSION, STEP, formatTime, initialState, stepRace, type InputEvent, type Replay } from './game/simulation.ts';
import { RaceRenderer } from './game/renderer.ts';
import { readBest, saveBest } from './game/storage.ts';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="topbar">
    <a class="brand" href="./" aria-label="Race Time home"><span class="brand-mark"><i></i><i></i><i></i></span><span>RACE<span class="brand-light">TIME</span><sup>REBORN</sup></span></a>
    <div class="mode-label"><span class="mode-pill">PRACTICE</span><span>One button. One more try.</span></div>
    <div class="top-actions"><button id="sound" class="icon-button" aria-label="Enable sound" aria-pressed="false">Sound off</button><button id="help" class="icon-button" aria-label="How to play">?</button></div>
  </header>
  <main class="game-shell">
    <div class="circuit-bar"><div><span class="eyebrow">THE CIRCUIT</span><h1>Farm River <span>SPRINT</span></h1></div><div class="circuit-meta"><span>3 LANES</span><span>2 LAPS</span><span>YOUR BEST GHOST</span></div></div>
    <div class="game-grid">
      <section class="race-panel" aria-label="Race circuit">
        <div id="track-view"></div>
        <div class="race-hud"><div class="lap-hud"><span class="eyebrow">LAP</span><strong id="lap">01 <small>/ 02</small></strong></div><div class="timer-hud"><span id="run-status" class="eyebrow">READY WHEN YOU ARE</span><strong id="timer">00:00.00</strong><span id="ghost-gap">Your first finish sets the pace</span></div><button id="pause" class="pause-button" aria-label="Pause race" disabled>Ⅱ</button></div>
        <div id="overlay" class="overlay"><div class="start-card"><span class="card-kicker">BACK ON THE STARTING LINE</span><h2>Find your rhythm.</h2><p>Hold to accelerate. Release for the corners.<br>Chase a better time, one lap at a time.</p><button id="start" class="primary-button">LET’S RACE <span>SPACE</span></button><div class="card-caption">or hold the accelerator below</div></div></div>
        <div class="track-bottom"><span class="racer-key"><i></i> YOU <i class="ghost-dot"></i> PERSONAL BEST</span><span id="contact-status">TAKE THE INSIDE LINE</span></div>
      </section>
      <aside class="race-sidebar">
        <div class="sidebar-section personal-best"><span class="eyebrow">THE TIME TO BEAT</span><strong id="best-time">--:--.--</strong><span id="best-caption">Make your first mark.</span><div class="best-rule"></div><label class="ghost-control" for="ghost-toggle"><span><span class="ghost-symbol">◈</span> Race your ghost</span><input id="ghost-toggle" type="checkbox" checked aria-label="Show your personal best ghost"><span class="switch" aria-hidden="true"></span></label></div>
        <div class="sidebar-section"><div class="section-heading"><h2>Your runs</h2><span>THIS SESSION</span></div><div id="run-list" class="run-list"><div class="empty-runs"><span class="empty-flag">⚑</span><p>A clean lap starts here.</p><span>Finish a race to record your time.</span></div></div><div class="local-note">Records stay on this device.</div></div>
        <div class="driving-note"><span class="eyebrow">A LITTLE LESS THROTTLE.</span><h3>A little more speed.</h3><p>Ease off before a tight turn. Grinding the edge costs you time.</p><div class="tip-track"><i></i><span>RELEASE. TURN. GO.</span></div></div>
      </aside>
    </div>
    <div class="controls-bar"><div class="speed-readout"><span class="eyebrow">PACE</span><div><strong id="speed">0</strong><span>%</span></div><div class="speed-meter"><i id="speed-fill"></i></div></div><button id="accelerator" class="accelerator" aria-label="Hold to accelerate; release to slow down" aria-pressed="false"><span class="throttle-icon">▰▰▰</span><span id="accelerator-label">HOLD TO ACCELERATE</span><kbd>SPACE</kbd></button><button id="restart" class="restart-button"><span>↻</span> RESTART <kbd>R</kbd></button></div>
  </main>
  <footer class="page-footer"><span>RACE TIME, REBORN.</span><span>A playable work in progress <span class="footer-divider">/</span> Farm River · 01</span><button id="fullscreen">Fullscreen</button></footer>
  <dialog id="help-dialog"><form method="dialog"><button class="close-dialog" aria-label="Close instructions">×</button><span class="eyebrow">HOW TO PLAY</span><h2>Simple to start.<br>Tricky to master.</h2><p><strong>Hold Space, the track, or the accelerator</strong> to go faster. Release before tight turns, then get back on the throttle.</p><p>You steer automatically. Speed shifts your line across three lanes. Touching an edge slows you down.</p><p>Finish two laps to save your best run. Your ghost will replay it next time. Press <strong>R</strong> to restart and <strong>P</strong> to pause.</p><p class="prototype-note">This prototype uses a recovered Farm River layout with reconstructed handling. Times and ghosts are local; online tournaments are not connected.</p><button class="primary-button">GOT IT</button></form></dialog>
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
let countdown = 3;
let lastCountdown = 3;
let accumulator = 0;
let events: InputEvent[] = [];
let recordedHeld = false;
let keyboardHeld = false;
const pointers = new Set<number>();
let sound = false;
let audio: AudioContext | null = null;
let runs: { ticks: number; contacts: number }[] = [];
let lastTime = performance.now();
let previousContact = 0;
const held = () => keyboardHeld || pointers.size > 0;

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
  } catch { /* Racing also works without audio support. */ }
}
function showOverlay(markup: string) { el('overlay').innerHTML = markup; el('overlay').hidden = !markup; }
function updateBest() {
  el('best-time').textContent = best ? formatTime(best.ticks * STEP) : '--:--.--';
  el('best-caption').textContent = best ? 'Your personal best. Yours to beat.' : 'Make your first mark.';
  el<HTMLInputElement>('ghost-toggle').disabled = !best;
}
updateBest();

function startRace() {
  if (phase === 'countdown' || phase === 'racing') return;
  state = initialState(); events = []; recordedHeld = false; accumulator = 0; previousContact = 0;
  ghost = best ? new Ghost(best) : null;
  countdown = 3; lastCountdown = 3; phase = 'countdown';
  el<HTMLButtonElement>('pause').disabled = false;
  el('pause').textContent = 'Ⅱ';
  showOverlay('<div class="countdown-number">3<span>GET READY</span></div>');
  beep(440);
}
function pauseRace() {
  if (phase !== 'racing' && phase !== 'countdown') return;
  pausedFrom = phase; phase = 'paused'; clearInput(); accumulator = 0;
  el('pause').textContent = '▶';
  showOverlay('<div class="start-card"><span class="card-kicker">TAKE A BREATHER</span><h2>Race paused.</h2><p>Your time is waiting right here.</p><button class="primary-button" data-action="resume">BACK TO THE TRACK</button></div>');
}
function resumeRace() {
  if (phase !== 'paused') return;
  phase = pausedFrom; lastTime = performance.now(); accumulator = 0;
  el('pause').textContent = 'Ⅱ'; showOverlay('');
  if (phase === 'countdown') showOverlay(`<div class="countdown-number">${Math.ceil(countdown)}<span>GET READY</span></div>`);
}
function clearInput() { keyboardHeld = false; pointers.clear(); }
function finishRace() {
  phase = 'finished'; clearInput();
  const oldBest = best;
  const newBest = !best || state.tick < best.ticks;
  let saved = true;
  if (newBest) {
    const replay: Replay = { version: SIM_VERSION, trackId: track.data.id, ticks: state.tick, events: events.map(e => ({ ...e })), createdAt: new Date().toISOString() };
    saved = saveBest(replay); best = replay; updateBest();
  }
  runs.push({ ticks: state.tick, contacts: state.contacts });
  el('run-list').innerHTML = runs.slice().sort((a, b) => a.ticks - b.ticks).slice(0, 4).map((run, i) => `<div class="run-row ${i === 0 ? 'fastest-run' : ''}"><span class="run-position">${String(i + 1).padStart(2, '0')}</span><div><strong>${formatTime(run.ticks * STEP)}</strong><span>${run.contacts} edge contact${run.contacts === 1 ? '' : 's'}</span></div><span class="run-tag">${i === 0 ? 'BEST' : 'FINISH'}</span></div>`).join('');
  const diff = oldBest ? (state.tick - oldBest.ticks) * STEP : null;
  const comparison = diff === null ? 'Your first ghost is ready. Race it next.' : diff < 0 ? `${Math.abs(diff).toFixed(2)}s faster than your previous best.` : diff === 0 ? 'You matched your personal best.' : `${diff.toFixed(2)}s behind your personal best.`;
  showOverlay(`<div class="start-card finish-card"><span class="card-kicker">${newBest ? 'A NEW PERSONAL BEST' : 'TWO LAPS. NICELY DONE.'}</span><h2>${formatTime(state.tick * STEP)}</h2><p>${comparison}</p>${!saved ? '<p class="save-warning">Storage unavailable. Your ghost is kept for this session.</p>' : ''}<button class="primary-button" data-action="restart">ONE MORE TRY <span>R</span></button><div class="card-caption">${state.contacts} edge contact${state.contacts === 1 ? '' : 's'} · ${newBest && saved ? 'Ghost saved on this device' : 'Keep finding your rhythm'}</div></div>`);
  el<HTMLButtonElement>('pause').disabled = true;
  beep(newBest ? 880 : 660, .22);
}

el('start').addEventListener('click', startRace);
el('overlay').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (button?.dataset.action === 'resume') resumeRace();
  if (button?.dataset.action === 'restart') startRace();
});
el('restart').addEventListener('click', () => { el('restart').blur(); clearInput(); phase = 'ready'; startRace(); });
el('pause').addEventListener('click', () => { el('pause').blur(); phase === 'paused' ? resumeRace() : pauseRace(); });
el<HTMLInputElement>('ghost-toggle').addEventListener('change', e => { ghostVisible = (e.target as HTMLInputElement).checked; });
el('sound').addEventListener('click', () => {
  el('sound').blur();
  sound = !sound; el('sound').textContent = sound ? 'Sound on' : 'Sound off';
  el('sound').setAttribute('aria-pressed', String(sound)); el('sound').setAttribute('aria-label', sound ? 'Disable sound' : 'Enable sound'); beep(660);
});
el('help').addEventListener('click', () => { pauseRace(); clearInput(); el<HTMLDialogElement>('help-dialog').showModal(); });
el('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { el('fullscreen').textContent = 'Fullscreen unavailable'; }
});
document.addEventListener('fullscreenchange', () => { el('fullscreen').textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'; });
for (const target of [el('accelerator'), el('track-view')]) {
  target.addEventListener('pointerdown', event => {
    if (event.button !== 0 || phase === 'paused' || el<HTMLDialogElement>('help-dialog').open) return;
    event.preventDefault();
    target.setPointerCapture(event.pointerId); pointers.add(event.pointerId);
    if (phase === 'ready' || phase === 'finished') startRace();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) target.addEventListener(name, event => pointers.delete((event as PointerEvent).pointerId));
}
window.addEventListener('keydown', event => {
  if (el<HTMLDialogElement>('help-dialog').open || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)) return;
  const isButton = (event.target as HTMLElement).tagName === 'BUTTON';
  if (event.code === 'Space' && !isButton) {
    event.preventDefault(); if (event.repeat) return;
    if (phase === 'paused') { resumeRace(); return; }
    keyboardHeld = true; if (phase === 'ready' || phase === 'finished') startRace();
  } else if (event.code === 'KeyR' && !event.repeat) { clearInput(); phase = 'ready'; startRace(); }
  else if ((event.code === 'KeyP' || event.code === 'Escape') && !event.repeat) { if (phase === 'paused') resumeRace(); else pauseRace(); }
});
// Space on the focused accelerator is continuous input, rather than a native click.
el('accelerator').addEventListener('keydown', event => {
  if (event.code === 'Space' || event.code === 'Enter') {
    event.preventDefault(); event.stopPropagation();
    if (phase === 'paused') { resumeRace(); return; }
    keyboardHeld = true; if (phase === 'ready' || phase === 'finished') startRace();
  }
});
window.addEventListener('keyup', event => { if (event.code === 'Space' || event.code === 'Enter') keyboardHeld = false; });
window.addEventListener('blur', () => { clearInput(); pauseRace(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); pauseRace(); } });

function frame(now: number) {
  const dt = Math.min((now - lastTime) / 1000, .1); lastTime = now;
  if (phase === 'countdown') {
    countdown -= dt;
    const number = Math.ceil(countdown);
    if (number !== lastCountdown && number > 0) { lastCountdown = number; showOverlay(`<div class="countdown-number">${number}<span>GET READY</span></div>`); beep(440); }
    if (countdown <= 0) { phase = 'racing'; accumulator = 0; showOverlay(''); beep(880, .15); }
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
  el('accelerator').classList.toggle('pressed', active); el('accelerator').setAttribute('aria-pressed', String(active));
  el('accelerator-label').textContent = active ? 'ACCELERATING' : phase === 'racing' ? 'RELEASED · TURNING' : 'HOLD TO ACCELERATE';
  el('timer').textContent = formatTime(state.tick * STEP);
  el('run-status').textContent = phase === 'racing' ? 'FIND YOUR FLOW' : phase === 'countdown' ? 'ON YOUR MARKS' : phase === 'paused' ? 'PAUSED' : phase === 'finished' ? 'FINISH' : 'READY WHEN YOU ARE';
  el('lap').innerHTML = `${state.progress >= track.count ? '02' : '01'} <small>/ 02</small>`;
  const pace = Math.round(state.speed / 640 * 100);
  el('speed').textContent = String(pace); el('speed-fill').style.width = `${pace}%`;
  el('contact-status').textContent = state.contactFlash ? 'EDGE CONTACT · SPEED LOST' : phase === 'racing' ? state.progress >= track.count ? 'FINAL LAP · MAKE IT COUNT' : 'RELEASE EARLY. EXIT FAST.' : 'TAKE THE INSIDE LINE';
  el('contact-status').classList.toggle('contact', !!state.contactFlash);
  if (ghost && phase === 'racing') {
    const delta = (state.progress - ghost.state.progress) / track.count;
    el('ghost-gap').textContent = Math.abs(delta) < .002 ? 'Side by side with your best' : delta > 0 ? 'Ahead of your personal best' : 'Chasing your personal best';
  } else el('ghost-gap').textContent = best ? `PERSONAL BEST ${formatTime(best.ticks * STEP)}` : 'Your first finish sets the pace';
  renderer.draw({ player: state, ghost: ghost?.state ?? null, ghostVisible, held: held(), racing: phase === 'racing' });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
