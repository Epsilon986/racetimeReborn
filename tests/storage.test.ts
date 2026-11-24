import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readBest, saveBest } from '../src/game/storage.ts';
import { initialState, SIM_VERSION, STEP, stepRace, type Replay } from '../src/game/simulation.ts';
import { Track } from '../src/game/track.ts';

const entries = new Map<string, string>();
const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
const track = new Track(JSON.parse(readFileSync(new URL('../src/data/farm-river.json', import.meta.url), 'utf8')));
const state = initialState();
while (!state.finished && state.tick < 3600) stepRace(track, state, true);
assert.equal(state.finished, true);
const replay: Replay = { version: SIM_VERSION, trackId: track.data.id, ticks: state.tick, events: [{ tick: 0, held: true }], createdAt: '2026-11-24T00:00:00Z' };
const key = `race-time:best:v${SIM_VERSION}:${replay.trackId}`;

test('personal-best input recording survives a save/load round trip', () => {
  entries.clear(); assert.equal(saveBest(replay), true); assert.deepEqual(readBest(track), replay);
});

test('malformed and incompatible replay data is rejected without throwing', () => {
  for (const bad of ['{', 'null', JSON.stringify({ ...replay, version: 999 }), JSON.stringify({ ...replay, trackId: 'other' }), JSON.stringify({ ...replay, ticks: -1 }), JSON.stringify({ ...replay, events: [{ tick: replay.ticks, held: true }] }), JSON.stringify({ ...replay, events: [{ tick: 100, held: true }, { tick: 50, held: false }] }), JSON.stringify({ ...replay, events: [{ tick: 0, held: 'yes' }] })]) {
    entries.set(key, bad); assert.equal(readBest(track), null);
  }
});

test('a replay must finish on its declared tick', () => {
  for (const invalid of [{ ...replay, ticks: 1, events: [] }, { ...replay, ticks: replay.ticks - 1 }, { ...replay, ticks: replay.ticks + 1 }]) {
    entries.set(key, JSON.stringify(invalid));
    assert.equal(readBest(track), null);
  }
});

test('saving an over-limit replay preserves the stored best', () => {
  assert.equal(saveBest(replay), true);
  assert.equal(saveBest({ ...replay, ticks: Math.round(600 / STEP) + 1 }), false);
  assert.deepEqual(readBest(track), replay);
});

test('unavailable browser storage does not prevent racing', () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage blocked'); } });
  try { assert.equal(readBest(track), null); assert.equal(saveBest(replay), false); }
  finally { Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true }); }
});
