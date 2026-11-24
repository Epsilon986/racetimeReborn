import { Ghost, SIM_VERSION, STEP, type Replay } from './simulation.ts';
import type { Track } from './track.ts';

const MAX_REPLAY_TICKS = Math.round(600 / STEP);
const key = (id: string) => `race-time:best:v${SIM_VERSION}:${id}`;
export function readBest(track: Track): Replay | null {
  try {
    const trackId = track.data.id;
    const r = JSON.parse(localStorage.getItem(key(trackId)) || 'null') as Replay | null;
    if (!r || r.version !== SIM_VERSION || r.trackId !== trackId || !Number.isSafeInteger(r.ticks) || r.ticks <= 0 || r.ticks > MAX_REPLAY_TICKS || !Array.isArray(r.events) || r.events.length > r.ticks) return null;
    let previous = -1;
    for (const e of r.events) {
      if (!Number.isSafeInteger(e.tick) || e.tick < 0 || e.tick >= r.ticks || e.tick <= previous || typeof e.held !== 'boolean') return null;
      previous = e.tick;
    }
    const ghost = new Ghost(r);
    while (!ghost.state.finished && ghost.state.tick < r.ticks) ghost.step(track);
    return ghost.state.finished && ghost.state.tick === r.ticks ? r : null;
  } catch { return null; }
}
export function saveBest(replay: Replay): boolean {
  if (replay.ticks > MAX_REPLAY_TICKS) return false;
  try { localStorage.setItem(key(replay.trackId), JSON.stringify(replay)); return true; } catch { return false; }
}
