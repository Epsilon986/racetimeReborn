import assert from 'node:assert/strict';
import test from 'node:test';
import { readBest, saveBest } from '../src/game/storage.ts';
import { SIM_VERSION, type Replay } from '../src/game/simulation.ts';

const entries = new Map<string, string>();
const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
const replay: Replay = { version: SIM_VERSION, trackId: 'farm-river-sprint', ticks: 1200, events: [{ tick: 0, held: true }, { tick: 300, held: false }], createdAt: '2026-11-24T00:00:00Z' };

test('personal-best input recording survives a save/load round trip', () => {
  entries.clear(); assert.equal(saveBest(replay), true); assert.deepEqual(readBest(replay.trackId), replay);
});

test('malformed and incompatible replay data is rejected without throwing', () => {
  const key = `race-time:best:v${SIM_VERSION}:${replay.trackId}`;
  for (const bad of ['{', 'null', JSON.stringify({ ...replay, version: 999 }), JSON.stringify({ ...replay, trackId: 'other' }), JSON.stringify({ ...replay, ticks: -1 }), JSON.stringify({ ...replay, events: [{ tick: 1300, held: true }] }), JSON.stringify({ ...replay, events: [{ tick: 100, held: true }, { tick: 50, held: false }] }), JSON.stringify({ ...replay, events: [{ tick: 0, held: 'yes' }] })]) {
    entries.set(key, bad); assert.equal(readBest(replay.trackId), null);
  }
});

test('unavailable browser storage does not prevent racing', () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage blocked'); } });
  try { assert.equal(readBest(replay.trackId), null); assert.equal(saveBest(replay), false); }
  finally { Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true }); }
});
