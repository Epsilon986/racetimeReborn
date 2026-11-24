import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Track } from '../src/game/track.ts';
import { Ghost, SIM_VERSION, STEP, formatTime, initialState, stepRace, type InputEvent } from '../src/game/simulation.ts';

const data = JSON.parse(readFileSync(new URL('../src/data/farm-river.json', import.meta.url), 'utf8'));
const track = new Track(data);

test('recovered track forms three finite, closed lane paths', () => {
  assert.equal(track.count, 225);
  assert.ok(track.totalLength > 1000);
  for (const lane of [0, 1, 2]) {
    assert.deepEqual(track.point(0, lane), track.point(track.count, lane));
    for (let progress = 0; progress < track.count; progress += .5) {
      const p = track.point(progress, lane);
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
      assert.ok(track.segmentLength(progress, lane) > 0);
    }
  }
});

test('recorded acceleration reproduces every simulation state exactly', () => {
  const player = initialState();
  const events: InputEvent[] = [];
  let previous = false;
  const states = [];
  for (let tick = 0; tick < 120 * 120 && !player.finished; tick++) {
    const held = tick % 320 < 230;
    if (held !== previous) { events.push({ tick, held }); previous = held; }
    stepRace(track, player, held);
    states.push({ ...player });
  }
  assert.ok(player.finished, 'race must reach the finish');
  const ghost = new Ghost({ version: SIM_VERSION, trackId: data.id, ticks: player.tick, events, createdAt: '2026-11-24T00:00:00Z' });
  for (const expected of states) { ghost.step(track); assert.deepEqual(ghost.state, expected); }
  assert.equal(player.progress, track.count * 2);
  const finish = { ...ghost.state }; ghost.step(track); assert.deepEqual(ghost.state, finish);
});

test('holding accelerates and releasing reduces speed', () => {
  const state = initialState();
  for (let i = 0; i < 120; i++) stepRace(track, state, true);
  const speed = state.speed;
  assert.ok(speed > 200);
  for (let i = 0; i < 30; i++) stepRace(track, state, false);
  assert.ok(state.speed < speed);
});

test('corner boundaries apply a speed penalty and keep the car on the road', () => {
  const state = initialState(); state.lane = 2.01; state.speed = 640;
  stepRace(track, state, true);
  assert.equal(state.contacts, 1);
  assert.ok(state.speed <= 320);
  assert.ok(state.lane >= 0 && state.lane <= 2);
});

test('different input strategies produce distinct times and valid lanes', () => {
  const throttle = initialState(), corners = initialState();
  for (let tick = 0; tick < 120 * 120 && (!throttle.finished || !corners.finished); tick++) {
    stepRace(track, throttle, true);
    const tight = Math.abs(track.corner(corners.progress + 1).curvature) > .003;
    stepRace(track, corners, !(tight && corners.speed > 430));
    for (const state of [throttle, corners]) assert.ok(state.lane >= 0 && state.lane <= 2);
  }
  assert.ok(throttle.finished && corners.finished);
  assert.notEqual(throttle.tick, corners.tick);
  assert.ok(corners.contacts < throttle.contacts, 'timed releases should reduce wall contact');
  console.log(`Full throttle: ${formatTime(throttle.tick * STEP)}, ${throttle.contacts} contacts. Corner timing: ${formatTime(corners.tick * STEP)}, ${corners.contacts} contacts.`);
});

test('race clock formats exact hundredths without rolling into 100', () => {
  assert.equal(formatTime(0), '00:00.00');
  assert.equal(formatTime(59.999), '00:59.99');
  assert.equal(formatTime(60), '01:00.00');
});
