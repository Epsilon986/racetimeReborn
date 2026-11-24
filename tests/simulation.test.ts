import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Track, TRACK_EDGES } from '../src/game/track.ts';
import { CAR_HALF_WIDTH, MAX_SPEED, Ghost, SIM_VERSION, STEP, formatTime, initialState, stepRace, type InputEvent } from '../src/game/simulation.ts';

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
  for (const [held, maxRetainedSpeed] of [[true, .32], [false, .42]] as const) {
    const state = { ...initialState(), lane: TRACK_EDGES[1], laneCenter: 2, speed: MAX_SPEED };
    stepRace(track, state, held);
    assert.equal(state.contacts, 1);
    assert.ok(state.speed < MAX_SPEED * maxRetainedSpeed);
    const limits = track.laneLimits(state.progress, CAR_HALF_WIDTH);
    assert.ok(state.lane >= limits.min && state.lane <= limits.max);
  }
});

test('different input strategies produce distinct times and valid lanes', () => {
  const throttle = initialState(), corners = initialState();
  for (let tick = 0; tick < 120 * 120 && (!throttle.finished || !corners.finished); tick++) {
    stepRace(track, throttle, true);
    const corner = track.corner(corners.progress + .6);
    const turn = corner.curvature * corner.orientation;
    const nearOutside = Math.abs(turn) > .0008 && (turn > 0 ? corners.lane < .6 : corners.lane > 1.4);
    stepRace(track, corners, !nearOutside);
    for (const state of [throttle, corners]) {
      const limits = track.laneLimits(state.progress, CAR_HALF_WIDTH);
      assert.ok(state.lane >= limits.min && state.lane <= limits.max);
    }
  }
  assert.ok(throttle.finished && corners.finished);
  assert.notEqual(throttle.tick, corners.tick);
  assert.ok(corners.contacts < throttle.contacts, 'timed releases should reduce wall contact');
  assert.ok(corners.tick < throttle.tick, 'corner-aware tapping should beat holding full throttle');
  console.log(`Full throttle: ${formatTime(throttle.tick * STEP)}, ${throttle.contacts} contacts. Corner timing: ${formatTime(corners.tick * STEP)}, ${corners.contacts} contacts.`);
});

test('three equal lanes have symmetric shoulders and matching wall geometry', () => {
  for (let progress = 0; progress < track.count; progress += .5) {
    const points = [-.5, .5, 1.5, 2.5].map(lane => track.point(progress, lane));
    const widths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
    assert.ok(widths.every(width => width > 1));
    assert.ok(Math.max(...widths) / Math.min(...widths) < 1.05);
    const limits = track.laneLimits(progress, CAR_HALF_WIDTH);
    for (const [wall, car] of [[TRACK_EDGES[0], limits.min], [TRACK_EDGES[1], limits.max]]) {
      const a = track.point(progress, wall), b = track.point(progress, car);
      assert.ok(Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - CAR_HALF_WIDTH) < .05);
    }
    for (const [wall, edge, width] of [[TRACK_EDGES[0], points[0], widths[0]], [TRACK_EDGES[1], points[3], widths[2]]] as const) {
      const p = track.point(progress, wall);
      assert.ok(Math.abs(Math.hypot(p.x - edge.x, p.y - edge.y) / width - .25) < .01);
    }
  }
});

test('steady acceleration through gentle bends leaves clearance in both outer lanes', () => {
  for (const [lane, progress] of [[0, 87], [2, 108]]) {
    const state = { ...initialState(), lane, laneCenter: lane, progress, speed: 750 };
    for (let tick = 0; tick < 30; tick++) {
      stepRace(track, state, true);
      assert.equal(state.laneCenter, lane);
      assert.equal(state.contacts, 0);
    }
    assert.ok(Math.abs(state.lane - lane) > .1, 'the bend should produce outward drift');
  }
});

test('a quick release reverses the line without dumping forward momentum', () => {
  let progress = 0;
  for (let i = 0; i < track.count; i++) {
    if (Math.abs(track.corner(i).curvature) > .004) { progress = i; break; }
  }
  const state = initialState();
  state.progress = progress; state.speed = 750;
  const turn = track.corner(progress).curvature * track.corner(progress).orientation;
  state.lateralSpeed = -Math.sign(turn) * 1.5;
  for (let tick = 0; tick < 10; tick++) stepRace(track, state, false);
  assert.ok(state.speed > 700, 'a brief lift should retain speed');
  assert.ok(state.lateralSpeed * turn > 0, 'release should turn inward promptly');
});

test('a brief lift adjusts the line without crossing a lane divider', () => {
  const state = initialState();
  state.progress = Array.from({ length: track.count }, (_, i) => i)
    .find(i => Math.abs(track.corner(i).curvature) > .004)!;
  state.speed = MAX_SPEED;
  for (let tick = 0; tick < 18; tick++) stepRace(track, state, false);
  assert.ok(Math.abs(state.lane - 1) > .05, 'a lift should still adjust the line');
  assert.ok(Math.abs(state.lane - 1) < .2, 'a 150 ms lift should make only a small correction');
  assert.equal(state.laneCenter, 1);
});

test('a car near a divider settles back into its current lane', () => {
  const state = initialState();
  state.lane = 1.54;
  for (let tick = 0; tick < 60; tick++) stepRace(track, state, false);
  assert.ok(Math.abs(state.lane - 1) < .13, 'without cornering drift the car should recenter promptly');
  for (let tick = 60; tick < 240; tick++) stepRace(track, state, false);
  assert.equal(state.laneCenter, 1);
  assert.ok(Math.abs(state.lane - 1) < .03);
});

test('sustained corner drift commits to the next lane', () => {
  const state = initialState();
  while (!state.finished && state.laneCenter === 1) stepRace(track, state, true);
  assert.notEqual(state.laneCenter, 1);
  assert.ok(Math.abs(state.lane - state.laneCenter) < .5);

  const center = state.laneCenter;
  state.speed = 0;
  for (let tick = 0; tick < 240; tick++) stepRace(track, state, false);
  assert.equal(state.laneCenter, center);
  assert.ok(Math.abs(state.lane - center) < .03);
});

test('acceleration reaches racing speed quickly and releasing can stop the car', () => {
  const state = initialState();
  for (let tick = 0; tick < 100; tick++) stepRace(track, state, true);
  assert.ok(state.speed > 650, 'the car should get going in under a second');
  for (let tick = 0; tick < 300; tick++) stepRace(track, state, false);
  assert.equal(state.speed, 0);
  const progress = state.progress;
  for (let tick = 0; tick < 60; tick++) stepRace(track, state, false);
  assert.equal(state.progress, progress);
});

test('race clock formats exact hundredths without rolling into 100', () => {
  assert.equal(formatTime(0), '00:00.00');
  assert.equal(formatTime(59.999), '00:59.99');
  assert.equal(formatTime(60), '01:00.00');
});
