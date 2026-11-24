import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { FollowCamera } from '../src/game/camera.ts';
import { Track } from '../src/game/track.ts';
import { STEP, initialState, stepRace } from '../src/game/simulation.ts';

const track = new Track(JSON.parse(readFileSync(new URL('../src/data/farm-river.json', import.meta.url), 'utf8')));

test('the follow camera keeps the player visible through a full race on phone and desktop', () => {
  for (const [width, height] of [[390, 844], [1440, 900], [844, 390]]) {
    const camera = new FollowCamera(); camera.resize(width, height);
    const state = initialState();
    camera.follow(track, state, 0, true);
    const initial = { x: camera.x, y: camera.y };
    while (!state.finished && state.tick < 120 * 90) {
      stepRace(track, state, state.tick % 180 < 145);
      camera.follow(track, state, STEP);
      const p = track.point(state.progress, state.lane);
      const dx = Math.abs(p.x - camera.x) * camera.scale;
      const dy = Math.abs(p.y - camera.y) * camera.scale;
      assert.ok(dx < width / 2 - 35 && dy < height / 2 - 35, 'player must remain inside the viewport');
    }
    assert.ok(state.finished);
    state.progress = track.count / 2; camera.follow(track, state, 0, true);
    assert.ok(Math.hypot(camera.x - initial.x, camera.y - initial.y) > 200, 'view must move with the racer');
    camera.follow(track, initialState(), 0, true);
    assert.ok(Math.hypot(camera.x - initial.x, camera.y - initial.y) < 1e-6, 'restart must reset the camera immediately');
    assert.ok(camera.scale > width / track.bounds.width, 'camera should be closer than a whole-track overview');
  }
});
