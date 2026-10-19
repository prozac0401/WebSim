'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Pose = require('./driving-pose.js');
const Race = require('./race-engine.js');
const Evolution = require('./tuning-evolution.js');
const circuits = require('./circuits.js');

// Full-lap observations from released 6cc17ff, using this entrant and 25 cm
// samples. These are geometric d(curvature)/ds, not a copy of the new solver.
const before = {
  everland: [.006998887169720275, .0008909384474049835, .009661583382225558],
  inje: [.006544149876669222, .000653617164542589, .00455752111543084],
  yeongam: [.025531619806503952, .001245210460687359, .02326595520796282],
  'yeongam-permanent': [.018545126833484915, .0013887336552419905, .014939536889385652],
  taebaek: [.012379232396444131, .0007631903952196125, .01820577866698536],
  'bmw-incheon': [.03337465740224893, .002019198363402755, .04975434565374082],
  'hmg-taean': [.0019815653061127855, .0002442729975262164, .001467197231173889],
  pocheon: [.38946664763765126, .01134180056508639, .6475148828144484],
  monza: [.009439073987867572, .0006787993046722976, .00974894366664869],
  silverstone: [.005988706934108648, .00048026265750182893, .003975960222793451],
  spa: [.01497305397352372, .0008675424786097999, .009500894678354799]
};
const races = circuits.map(circuit => new Race({ circuit, laps: 1,
  entrants: Evolution.createPopulation({ vehicleId: 'supra', count: 8, seed: 31415, budget: 30 }).slice(0, 1) }));

test('every course reduces full-lap steering derivative peaks, RMS and knot jumps', t => {
  const reports = [];
  for (const race of races) {
    const car = race.cars[0]; car.standingStartDistance = null;
    const sample = s => Pose.sampleCar(race, car, s), h = .25;
    let peak = 0, sum = 0, count = 0, jump = 0;
    for (let s = 0; s < car.trackLength; s += h) {
      const derivative = (sample(s + h).curvature - sample(s - h).curvature) / (2 * h);
      peak = Math.max(peak, Math.abs(derivative)); sum += derivative * derivative; count++;
    }
    const info = Pose.info(race, car), knots = car.pathPoints.length * info.subdivisions, epsilon = .0001;
    for (let i = 0; i < knots; i++) {
      const s = i * car.trackLength / knots;
      const left = (sample(s - epsilon).curvature - sample(s - 2 * epsilon).curvature) / epsilon;
      const right = (sample(s + 2 * epsilon).curvature - sample(s + epsilon).curvature) / epsilon;
      jump = Math.max(jump, Math.abs(right - left));
    }
    const rms = Math.sqrt(sum / count), baseline = before[race.circuit.id];
    assert.ok(peak < baseline[0], race.circuit.id + ': worst derivative');
    assert.ok(rms < baseline[1], race.circuit.id + ': lap RMS derivative');
    assert.ok(jump < baseline[2], race.circuit.id + ': cubic knot derivative jump');
    if (race.circuit.id === 'taebaek') assert.ok(peak < baseline[0] * .3, 'at least 70% reduction at the reported uphill turn');
    if (race.circuit.id === 'pocheon') assert.ok(peak < baseline[0] * .2, 'remove the extreme short-corner derivative spike');
    reports.push({ id: race.circuit.id, peakRatio: peak / baseline[0], rmsRatio: rms / baseline[1], knotJumpRatio: jump / baseline[2] });
  }
  t.diagnostic(JSON.stringify(reports));
});

test('the sharpest remaining Pocheon bend keeps finite forward motion and a bounded radius', () => {
  const race = races.find(r => r.circuit.id === 'pocheon'), car = race.cars[0];
  let peak = 0;
  for (let s = 2700; s <= 2750; s += .1) {
    const a = Pose.sampleCar(race, car, s - .001), p = Pose.sampleCar(race, car, s), b = Pose.sampleCar(race, car, s + .001);
    const run = Math.hypot(b.x - a.x, b.y - a.y) / .002;
    assert.ok(run > .65 && run < 1.25, 'the curve does not stop or fold at the hairpin');
    assert.ok(Math.abs(Math.atan2(Math.sin(Math.atan2(b.y - a.y, b.x - a.x) - p.angle),
      Math.cos(Math.atan2(b.y - a.y, b.x - a.x) - p.angle))) < .00001, 'heading is the position tangent');
    peak = Math.max(peak, Math.abs(p.curvature));
  }
  // The old display peak was .55/m. This still is an approximation of a
  // coarse source route, not a claim that its radius equals the force model.
  assert.ok(peak < .34 && peak > .15, 'round the cusp without removing the hairpin');
});

test('cars sharing an immutable path reuse its solve while timing-line and length changes invalidate it', () => {
  const race = races.find(r => r.circuit.id === 'taebaek'), car = race.cars[0];
  const twin = { ...car, standingStartDistance: null }, info = Pose.info(race, car);
  assert.strictEqual(Pose.info(race, twin), info, 'one solve per shared source geometry');
  assert.strictEqual(Pose.pathCar(race, twin), Pose.pathCar(race, car), 'same immutable drawn path');
  const slowerChainage = { ...twin, trackLength: car.trackLength * 1.01 };
  assert.notStrictEqual(Pose.info(race, slowerChainage), info, 'length controls derivatives and cache identity');
  const shiftedTiming = { ...race, track: { ...race.track, points: race.track.points.map(p => ({ ...p, x: p.x + 2 })) } };
  const standing = { ...twin, distance: 0, standingStartDistance: 0 };
  assert.notStrictEqual(Pose.info(shiftedTiming, standing), info, 'timing geometry participates in the shared cache key');
  assert.equal(Pose.sampleCar(shiftedTiming, standing, 0).x, shiftedTiming.track.points[0].x, 'fresh launch uses its own start line');
  assert.equal(Pose.sampleCar(race, standing, 0).x, race.track.points[0].x, 'reusing a car with another race cannot retain the previous launch');
});
