import { SIM_VERSION, type Replay } from './simulation.ts';
const key = (id: string) => `race-time:best:v${SIM_VERSION}:${id}`;
export function readBest(trackId: string): Replay | null {
  try {
    const r = JSON.parse(localStorage.getItem(key(trackId)) || 'null') as Replay | null;
    if (!r || r.version !== SIM_VERSION || r.trackId !== trackId || !Number.isSafeInteger(r.ticks) || r.ticks <= 0 || r.ticks > 120 * 600 || !Array.isArray(r.events) || r.events.length > r.ticks) return null;
    let previous = -1;
    for (const e of r.events) {
      if (!Number.isSafeInteger(e.tick) || e.tick < 0 || e.tick >= r.ticks || e.tick <= previous || typeof e.held !== 'boolean') return null;
      previous = e.tick;
    }
    return r;
  } catch { return null; }
}
export function saveBest(replay: Replay): boolean {
  try { localStorage.setItem(key(replay.trackId), JSON.stringify(replay)); return true; } catch { return false; }
}
