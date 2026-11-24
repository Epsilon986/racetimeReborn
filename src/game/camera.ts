import { Track } from './track.ts';
import type { RaceState } from './simulation.ts';

/** North-up camera: close to the racer, with a little room to see the next corner. */
export class FollowCamera {
  x = 0;
  y = 0;
  scale = 1;
  private initialized = false;

  resize(width: number, height: number) {
    this.scale = Math.max(0.72, Math.min(1.15, Math.min(width, height) / 660));
  }

  follow(track: Track, state: RaceState, dt: number, snap = false) {
    const point = track.point(state.progress, state.lane);
    const heading = track.heading(state.progress + 0.6, state.lane);
    const lookAhead = 75 + state.speed * 0.08;
    const x = point.x + Math.cos(heading) * lookAhead;
    const y = point.y + Math.sin(heading) * lookAhead;
    const mix = snap || !this.initialized ? 1 : 1 - Math.exp(-12 * Math.max(0, dt));
    this.x += (x - this.x) * mix;
    this.y += (y - this.y) * mix;
    this.initialized = true;
  }
}
