'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const BrakeLights = require('./brake-light-state.js');
const input = (deceleration, massKg = 1800) => ({ brakeForceN: deceleration * massKg, massKg });
const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('service-brake force operates lamps across vehicle masses; hill and coast deceleration do not', () => {
  for (const mass of [1000, 1800, 3000]) {
    const state = BrakeLights.create();
    BrakeLights.update(state, 1, { ...input(0, mass), acceleration: -4, phase: 'braking', grade: .3 });
    assert.deepEqual(state, BrakeLights.create());
    BrakeLights.update(state, 1 / 120, input(.099, mass)); assert.equal(state.on, false);
    assert.equal(BrakeLights.update(state, .035, input(.1, mass)), state);
    assert.equal(state.on, true); close(state.intensity, 1 - Math.exp(-1));
  }
});

test('long light trail braking and short zero-force gaps retain steady light', () => {
  const state = BrakeLights.create();
  BrakeLights.update(state, 1, input(1));
  for (let i = 0; i < 1200; i++) {
    // Ten seconds of light trail force with repeated 0.1-second interruptions.
    const force = i % 60 < 12 ? 0 : .04;
    BrakeLights.update(state, 1 / 120, input(force));
    assert.equal(state.on, true); assert.ok(state.intensity > .999);
  }
  assert.equal(state.releaseSeconds, 0);
});

test('hysteresis rejects weak initial chatter and prevents release-threshold flicker', () => {
  const state = BrakeLights.create();
  for (let i = 0; i < 600; i++) BrakeLights.update(state, 1 / 120, input(i % 2 ? .031 : .029));
  assert.deepEqual(state, BrakeLights.create());
  BrakeLights.update(state, .25, input(.2));
  for (let i = 0; i < 600; i++) {
    BrakeLights.update(state, 1 / 120, input(i % 2 ? .031 : .029));
    assert.equal(state.on, true); assert.ok(state.intensity > .999);
  }
});

test('release holds for 0.18 seconds and then fades without extending the hold by a whole tick', () => {
  const state = BrakeLights.create();
  BrakeLights.update(state, 1, input(1));
  const initial = state.intensity;
  BrakeLights.update(state, .2, input(0));
  assert.equal(state.on, false);
  close(state.intensity, (1 + (initial - 1) * Math.exp(-.18 / .035)) * Math.exp(-.02 / .07));
  assert.ok(state.intensity > .7, 'rendered intensity remains during the release fade');
  BrakeLights.update(state, 1, input(0));
  assert.deepEqual(state, BrakeLights.create());
});

test('cadence does not change attack, trail hold or the hold-to-release boundary', () => {
  const segments = [[.13, .3], [.11, 0], [.24, .04], [.23, 0], [.08, .2], [.4, 0]];
  function run(maxStep) {
    const state = BrakeLights.create();
    for (const [duration, deceleration] of segments) {
      let elapsed = 0;
      while (elapsed < duration - 1e-12) {
        const dt = Math.min(maxStep, duration - elapsed);
        BrakeLights.update(state, dt, input(deceleration)); elapsed += dt;
        assert.ok(Number.isFinite(state.intensity) && state.intensity >= 0 && state.intensity <= 1);
      }
    }
    return state;
  }
  const reference = run(Infinity);
  for (const step of [1 / 120, 1 / 60, 1 / 30, .037]) {
    const actual = run(step); assert.equal(actual.on, reference.on);
    close(actual.intensity, reference.intensity); close(actual.releaseSeconds, reference.releaseSeconds);
  }
});

test('pause is stable and finish or DNF clears both switch and fade immediately', () => {
  const state = BrakeLights.create();
  BrakeLights.update(state, .1, input(.2));
  const paused = { ...state };
  for (let i = 0; i < 100; i++) BrakeLights.update(state, 0, input(0));
  assert.deepEqual(state, paused);
  for (const terminal of ['finished', 'dnf']) {
    BrakeLights.update(state, .1, input(.2));
    BrakeLights.update(state, 0, { ...input(1), [terminal]: true });
    assert.deepEqual(state, BrakeLights.create());
  }
});

test('cars and fresh replay states are independent and input objects remain unchanged', () => {
  const first = BrakeLights.create(), second = BrakeLights.create();
  const applied = Object.freeze(input(.4));
  BrakeLights.update(first, .2, applied); assert.equal(first.on, true);
  assert.deepEqual(second, BrakeLights.create());
  BrakeLights.update(second, .05, input(.04)); assert.equal(second.on, false);
  const replay = BrakeLights.create(); BrakeLights.update(replay, .2, applied);
  assert.deepEqual(replay, first); assert.notEqual(replay, first);
  assert.deepEqual(applied, input(.4));
});

test('invalid elapsed time cannot corrupt state and absent brake input cannot light lamps', () => {
  const state = BrakeLights.create();
  for (const dt of [-1, NaN, Infinity]) assert.throws(() => BrakeLights.update(state, dt, input(1)), RangeError);
  for (const invalid of [{}, { brakeForceN: Infinity, massKg: 1800 }, { brakeForceN: 100, massKg: 0 }, { brakeForceN: -100, massKg: 1800 }])
    BrakeLights.update(state, .1, invalid);
  assert.deepEqual(state, BrakeLights.create());
});
