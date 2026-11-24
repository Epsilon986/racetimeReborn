import { Track, clamp } from './track.ts';

export const STEP = 1 / 120;
export const SIM_VERSION = 1;
export type InputEvent = { tick: number; held: boolean };
export type Replay = { version: number; trackId: string; ticks: number; events: InputEvent[]; createdAt: string };
export type RaceState = { tick: number; progress: number; lane: number; lateralSpeed: number; speed: number; finished: boolean; wallCooldown: number; contacts: number; contactFlash: number };
export function initialState(): RaceState {
  return { tick: 0, progress: 0, lane: 1, lateralSpeed: 0, speed: 0, finished: false, wallCooldown: 0, contacts: 0, contactFlash: 0 };
}

/** Rendering-independent prototype tuning; not an exact port of the original APK. */
export function stepRace(track: Track, state: RaceState, held: boolean): void {
  if (state.finished) return;
  state.tick++;
  state.wallCooldown = Math.max(0, state.wallCooldown - STEP);
  state.contactFlash = Math.max(0, state.contactFlash - STEP);
  const targetSpeed = held ? 640 : 185;
  state.speed += clamp(targetSpeed - state.speed, -(held ? 100 : 500) * STEP, (held ? 270 : 80) * STEP);
  const corner = track.corner(state.progress);
  const force = corner.curvature * state.speed * state.speed / Math.max(30, corner.width) * corner.orientation;
  state.lateralSpeed += force * (held ? -0.05 : 0.12) * STEP;
  state.lateralSpeed *= Math.exp(-3.8 * STEP);
  state.lane += state.lateralSpeed * STEP;
  if (state.lane < 0 || state.lane > 2) {
    state.lane = clamp(state.lane, 0, 2);
    state.lateralSpeed *= -0.12;
    if (!state.wallCooldown) {
      state.speed *= held ? 0.5 : 0.8;
      state.wallCooldown = 0.38;
      state.contactFlash = 0.25;
      state.contacts++;
    }
  }
  // Consume distance across each segment, including lane-specific segment lengths.
  let distance = state.speed * STEP;
  while (distance > 0 && !state.finished) {
    const length = Math.max(1, track.segmentLength(state.progress, state.lane));
    const fraction = state.progress - Math.floor(state.progress);
    const remaining = (1 - fraction) * length;
    if (distance < remaining) { state.progress += distance / length; break; }
    state.progress = Math.floor(state.progress) + 1;
    distance -= remaining;
    if (state.progress >= track.count * 2) { state.progress = track.count * 2; state.finished = true; }
  }
}

export class Ghost {
  readonly replay: Replay;
  readonly state = initialState();
  private cursor = 0;
  private held = false;
  constructor(replay: Replay) { this.replay = replay; }
  step(track: Track) {
    while (this.cursor < this.replay.events.length && this.replay.events[this.cursor].tick <= this.state.tick) {
      this.held = this.replay.events[this.cursor++].held;
    }
    stepRace(track, this.state, this.held);
  }
}

export function formatTime(seconds: number): string {
  const hundredths = Math.max(0, Math.floor(seconds * 100 + 0.000001));
  return `${Math.floor(hundredths / 6000).toString().padStart(2, '0')}:${Math.floor(hundredths / 100 % 60).toString().padStart(2, '0')}.${(hundredths % 100).toString().padStart(2, '0')}`;
}
