import { Track, clamp } from './track.ts';

export const STEP = 1 / 120;
export const SIM_VERSION = 2;
export const MAX_SPEED = 920;
export const CAR_HALF_WIDTH = 17;
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
  state.speed = clamp(state.speed + (held ? 820 : -440) * STEP, 0, MAX_SPEED);
  const corner = track.corner(state.progress);
  const force = corner.curvature * state.speed * state.speed / Math.max(30, corner.width) * corner.orientation;
  // Release changes the line immediately, without first fighting a long inertial slide.
  // Retaining forward momentum makes quick taps useful instead of expensive braking.
  const lateralTarget = clamp(force * (held ? -0.065 : 0.3), -6, 6);
  state.lateralSpeed += (lateralTarget - state.lateralSpeed) * (1 - Math.exp(-24 * STEP));
  state.lane += state.lateralSpeed * STEP;
  const limits = track.laneLimits(state.progress, CAR_HALF_WIDTH);
  if (state.lane < limits.min || state.lane > limits.max) {
    state.lane = clamp(state.lane, limits.min, limits.max);
    state.lateralSpeed = 0;
    if (!state.wallCooldown) {
      state.speed *= held ? 0.78 : 0.9;
      state.wallCooldown = 0.5;
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
  // A new segment may be narrower: keep the car's body inside the same visible walls.
  const nextLimits = track.laneLimits(state.progress, CAR_HALF_WIDTH);
  state.lane = clamp(state.lane, nextLimits.min, nextLimits.max);
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
