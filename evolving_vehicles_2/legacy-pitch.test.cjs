'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const Pose = require('./driving-pose.js'), Race = require('./race-engine.js');
const Evolution = require('./tuning-evolution.js'), circuits = require('./circuits.js'), Renderer = require('./circuit-renderer.js');
const circuit = circuits.find(c => c.id === 'pocheon');
function fixture(vehicleId = 'supra') {
  const race = new Race({ circuit, entrants: Evolution.createPopulation({ vehicleId, count: 8, seed: 31415, budget: 30 }).slice(0, 1), laps: 1 });
  const renderer = new Renderer({ style: {}, getContext: () => ({}), addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ width: 980, height: 615 }) });
  renderer.setRace(race); return { race, car: race.cars[0], renderer };
}
const rms = a => Math.sqrt(a.reduce((sum, value) => sum + value * value, 0) / a.length);

test('the legacy Pocheon curve uses finite wheelbase support without restoring pitch spikes', t => {
  const { race, car, renderer } = fixture(), saved = JSON.stringify({ cars: race.cars, track: race.track });
  assert.equal(renderer.roadGeometry.stats.method, 'legacy-offset-fallback');
  const pitch = []; let maximumHeightChange = 0, maximumLateralChord = 0;
  for (let s = 2670; s <= 2790; s += .25) {
    const raw = Pose.sampleCar(race, car, s), support = Pose.curveBodySupport(race, car, raw, 1.75), p = renderer._displayPose(raw, car);
    assert.ok(support); assert.ok(support.wheelbaseErrorM < .001);
    assert.deepEqual([p.x, p.y, p.angle, p.curvature], [raw.x, raw.y, raw.angle, raw.curvature]);
    assert.equal(p.z, renderer._displayHeight((support.front.z + support.rear.z) / 2));
    const rise = renderer._displayHeight(support.front.z) - renderer._displayHeight(support.rear.z);
    assert.ok(Math.abs(Math.hypot(support.along, rise) - car.wheelbaseM) < .001, 'the spatial support chord has the real wheelbase');
    assert.ok(Math.abs(p.grade - rise / support.along) < 1e-12, 'pitch comes from the same two spatial heights');
    maximumHeightChange = Math.max(maximumHeightChange, Math.abs(p.z - renderer._displayHeight(raw.z)));
    maximumLateralChord = Math.max(maximumLateralChord, support.lateral); pitch.push(Math.atan(p.grade));
  }
  const first = pitch.slice(1).map((value, i) => (value - pitch[i]) / .25);
  const second = first.slice(1).map((value, i) => (value - first[i]) / .25);
  const peak = Math.max(...first.map(Math.abs)) * 180 / Math.PI, secondRMS = rms(second) * 180 / Math.PI;
  // Released 6cc17ff actual browser measurements at these same .25 m points.
  assert.ok(peak < 3.6663784938984234 && secondRMS < 1.0039665575797128);
  assert.ok(maximumHeightChange < .04 && maximumLateralChord < .02, 'bounded approximate contact, without moving the horizontal pose');
  assert.equal(JSON.stringify({ cars: race.cars, track: race.track }), saved, 'physical state and source heights stay untouched');
  t.diagnostic(JSON.stringify({ peakDegPerM: peak, secondRMSDegPerM2: secondRMS, maximumHeightChange, maximumLateralChord }));
  renderer.destroy();
});

test('legacy curve support is stateless and retains standing, rolling and subsequent-lap sampling', () => {
  const { race, car, renderer } = fixture('staria');
  for (const standingStartDistance of [0, null]) for (const distance of [-4, 0, 10, 49.9, 50.1, 2718, car.trackLength + 10]) {
    const c = { ...car, distance, standingStartDistance }, p = Pose.sampleCar(race, c, distance);
    const support = Pose.curveBodySupport(race, c, p, 1.75); assert.ok(support);
    Pose.curveBodySupport(race, c, Pose.sampleCar(race, c, distance + 15), 1.75);
    assert.deepEqual(Pose.curveBodySupport(race, c, p, 1.75), support, 'sampling order cannot add pitch lag');
    if (distance < -car.wheelbaseM && standingStartDistance === 0) assert.ok(Math.abs(support.grade - p.grade * 1.75) < 1e-8, 'both supports on the launch continuation retain its straight tangent');
  }
  assert.equal(Pose.curveBodySupport(race, {}, { s: 0, z: 0, angle: 0 }, 1.75), null);
  renderer.destroy();
});
